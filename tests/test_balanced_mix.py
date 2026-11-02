import copy
import random
from collections import Counter
from fractions import Fraction

import pytest

from backend.data import store as s
from backend.data.reconstruction import balanced_mix


def dataset(did, a_count=80, size=100):
    return {
        "id": did,
        "name": did,
        "workspace_id": did,
        "schema_id": "visual-v1",
        "rows": [
            {
                "id": f"{did}-{i}",
                "product_id": str(i),
                "sha256": f"{did}-{i}",
                "image": f"/images/{did}-{i}.jpg",
                "source": "same-origin",
                "split": "train",
                "category": "상의",
                "target": {"fit": "슬림" if i < a_count else "레귤러"},
                "unscored_fields": [],
                "label_source": "model",
            }
            for i in range(size)
        ],
    }


def test_equal_mix_preserves_both_profiles_and_ignores_shared_source_name():
    parents = [dataset("old"), dataset("new", 20)]
    before = copy.deepcopy(parents)
    rows, info = balanced_mix(parents, 20, 42)
    assert Counter(r["id"].split("-")[0] for r in rows) == {"old": 10, "new": 10}
    assert Counter(r["target"]["fit"] for r in rows if r["id"].startswith("old")) == {
        "슬림": 8,
        "레귤러": 2,
    }
    assert Counter(r["target"]["fit"] for r in rows if r["id"].startswith("new")) == {
        "슬림": 2,
        "레귤러": 8,
    }
    assert info["after_js"] == pytest.approx(0)
    assert all(m["target_ratio"] == m["actual_ratio"] == 0.5 for m in info["mix"])
    assert balanced_mix(parents, 20, 42) == (rows, info)
    assert parents == before


def test_weights_control_snapshot_counts_and_weighted_attribute_target():
    parents = [dataset("old"), dataset("new", 20)]
    rows, info = balanced_mix(parents, 50, 42, {"old": 80, "new": 20})
    assert Counter(r["id"].split("-")[0] for r in rows) == {"old": 40, "new": 10}
    assert Counter(r["target"]["fit"] for r in rows) == {"슬림": 34, "레귤러": 16}
    assert info["after_js"] == pytest.approx(0)
    single, meta = balanced_mix(parents, 7, 42, {"old": 100, "new": 0})
    assert all(r["id"].startswith("old") for r in single)
    assert (
        next(m for m in meta["mix"] if m["dataset_id"] == "new")["selected_count"] == 0
    )


def test_overlap_is_allocated_once_and_original_parent_row_is_preserved():
    a, b = dataset("a", 5, 10), dataset("b", 5, 10)
    for left, right in zip(a["rows"], b["rows"], strict=False):
        right["sha256"] = left["sha256"]
    rows, meta = balanced_mix([a, b], 8, 5)
    assert len({r["sha256"] for r in rows}) == 8
    assert Counter(r["id"].split("-")[0] for r in rows) == {"a": 4, "b": 4}
    assert {m["dataset_id"]: m["selected_count"] for m in meta["mix"]} == {
        "a": 4,
        "b": 4,
    }
    assert all(r in a["rows"] or r in b["rows"] for r in rows)
    b["rows"][0]["unscored_fields"] = ["fit"]
    with pytest.raises(ValueError, match="중복 이미지"):
        balanced_mix([a, b], 8, 5)


def test_masked_values_do_not_become_distribution_targets():
    parents = [dataset("a", size=10), dataset("b", size=10)]
    for d in parents:
        for r in d["rows"]:
            r["target"]["hidden"] = "do-not-target"
            r["unscored_fields"] = ["hidden"]
    _, info = balanced_mix(parents, 10, 0)
    assert "hidden" not in info["fields"]


def test_small_overlapping_pools_match_independent_quota_feasibility_oracle():
    rng = random.Random(7)
    for trial in range(45):
        parents = [dataset(d, size=0) for d in ["a", "b", "c"]]
        masks = [rng.randint(1, 7) for _ in range(8)]
        raw = [rng.randint(0, 3) for _ in range(3)]
        if not sum(raw):
            raw[0] = 1
        exact = [Fraction(5 * w, sum(raw)) for w in raw]
        quotas = [int(x) for x in exact]
        for i in sorted(range(3), key=lambda i: (-(exact[i] - quotas[i]), i))[
            : 5 - sum(quotas)
        ]:
            quotas[i] += 1
        reachable = {(0, 0, 0)}
        for j, mask in enumerate(masks):
            next_states = set(reachable)
            for state in reachable:
                for i in range(3):
                    if mask & (1 << i) and state[i] < quotas[i]:
                        newer = list(state)
                        newer[i] += 1
                        next_states.add(tuple(newer))
            reachable = next_states
            for i in range(3):
                if mask & (1 << i):
                    parents[i]["rows"].append(
                        {
                            "id": f"{parents[i]['id']}-{j}",
                            "sha256": str(j),
                            "split": "train",
                            "target": {"fit": str(j % 2)},
                        }
                    )
        weights = dict(zip(["a", "b", "c"], raw, strict=False))
        if tuple(quotas) not in reachable:
            with pytest.raises(ValueError, match="부족"):
                balanced_mix(parents, 5, trial, weights)
        else:
            rows, info = balanced_mix(parents, 5, trial, weights)
            assert len({r["sha256"] for r in rows}) == 5
            assert [m["selected_count"] for m in info["mix"]] == quotas


def test_api_preview_save_match_and_invalid_weights_are_atomic(client):
    parents = [dataset("old"), dataset("new", 20)]
    for d in parents:
        d["rows"].append(
            d["rows"][0]
            | {
                "id": d["id"] + "-heldout",
                "sha256": d["id"] + "-heldout",
                "split": "validation",
            }
        )
        s.save("workspace", {"id": d["workspace_id"], "name": d["name"]})
        s.save("dataset", d)
    request = {
        "name": "mixed",
        "dataset_ids": ["old", "new"],
        "method": "balanced_mix",
        "data_count": 25,
        "dataset_weights": {"old": 80, "new": 20},
    }
    preview = client.post("/api/reconstructions/preview", json=request)
    assert preview.status_code == 200, preview.text
    default_request = {
        k: v for k, v in request.items() if k not in ("method", "dataset_weights")
    }
    default = client.post("/api/reconstructions/preview", json=default_request)
    assert default.status_code == 200, default.text
    assert len(default.json()["selection"]["mix"]) == 2
    assert all(m["target_ratio"] == 0.5 for m in default.json()["selection"]["mix"])
    assert preview.json()["count"] == preview.json()["splits"]["train"] == 25
    assert preview.json()["selection"]["scope"] == "train_only"
    assert sum(m["selected_count"] for m in preview.json()["selection"]["mix"]) == 25
    result = client.post("/api/reconstructions", json=request)
    assert result.status_code == 201, result.text
    assert result.json()["fingerprint"] == preview.json()["fingerprint"]
    assert all(s.get("dataset", d["id"]) == d for d in parents)
    before = (len(s.all_of("dataset")), len(s.all_of("workspace")))
    for weights in [
        {"old": 1},
        {"old": 0, "new": 0},
        {"old": -1, "new": 1},
        {"old": 101, "new": 1},
    ]:
        assert (
            client.post(
                "/api/reconstructions", json=request | {"dataset_weights": weights}
            ).status_code
            == 422
        )
    assert (
        client.post(
            "/api/reconstructions", json=request | {"method": "random"}
        ).status_code
        == 422
    )
    assert (len(s.all_of("dataset")), len(s.all_of("workspace"))) == before
    for bad in [float("nan"), float("inf")]:
        with pytest.raises(ValueError, match="비율"):
            balanced_mix(parents, 20, 42, {"old": bad, "new": 1})
