import copy
from collections import Counter

import pytest

from backend.api import Reconstruction, reconstruct
from backend.data import store as s


def body(**changes):
    return Reconstruction(name="result", dataset_ids=["d"], data_count=4, **changes)


def test_total_is_exact_training_count_and_legacy_is_compatible(client):
    original = copy.deepcopy(s.get("dataset", "d"))
    for method in ["random", "source_balanced"]:
        result = reconstruct(body(method=method))
        assert len(result["rows"]) == 4
        assert all(r["split"] == "train" for r in result["rows"])
        assert result["selection"]["scope"] == "train_only"
        assert result["fingerprint"] == reconstruct(body(method=method))["fingerprint"]
        assert all(row in original["rows"] for row in result["rows"])
    assert (
        len(
            reconstruct(Reconstruction(name="old", dataset_ids=["d"], train_budget=4))[
                "rows"
            ]
        )
        == 8
    )
    assert s.get("dataset", "d") == original


def test_merge_deduplicates_and_does_not_carry_heldout(client):
    original = s.get("dataset", "d")
    duplicate = copy.deepcopy(original)
    duplicate["id"] = "copy"
    s.save("dataset", duplicate)
    result = reconstruct(
        Reconstruction(name="merge", dataset_ids=["d", "copy"], method="merge")
    )
    assert len(result["rows"]) == 8
    assert result["selection"]["duplicate_count"] == 8
    assert all(r["split"] == "train" for r in result["rows"])
    assert len({r["sha256"] for r in result["rows"]}) == 8
    assert result["selection"]["by_source"] == {"musinsa": 4, "gsshop": 4}
    duplicate["rows"][0]["split"] = "test"
    s.save("dataset", duplicate)
    with pytest.raises(ValueError, match="conflicting"):
        reconstruct(
            Reconstruction(name="bad", dataset_ids=["d", "copy"], method="merge")
        )


def test_distribution_selects_reference_mix_and_masks_excluded_values(client):
    reference = s.get("dataset", "d")
    reference["rows"] = [
        dict(
            reference["rows"][0],
            id=f"ref-{i}",
            sha256=f"ref-{i}",
            target={"fit": "a" if i < 8 else "b"},
        )
        for i in range(10)
    ]
    pool = copy.deepcopy(reference)
    pool["id"] = "pool"
    pool["rows"] = [
        dict(
            reference["rows"][0],
            id=f"pool-{i}",
            sha256=f"pool-{i}",
            target={"fit": "b" if i < 80 else "a"},
        )
        for i in range(100)
    ]
    s.save("dataset", reference)
    s.save("dataset", pool)
    request = Reconstruction(
        name="match",
        dataset_ids=["d", "pool"],
        method="distribution",
        reference_id="d",
        data_count=10,
    )
    result = reconstruct(request)
    assert Counter(r["target"]["fit"] for r in result["rows"]) == {"a": 8, "b": 2}
    assert result["selection"]["after_js"] == pytest.approx(0)
    assert result["selection"]["after_js"] < result["selection"]["before_js"]
    assert result["fingerprint"] == reconstruct(request)["fingerprint"]
    assert s.get("dataset", "d") == reference
    assert s.get("dataset", "pool") == pool
    for row in reference["rows"]:
        row["unscored_fields"] = ["fit"]
    s.save("dataset", reference)
    with pytest.raises(ValueError, match="비교할 속성"):
        reconstruct(request)


def test_invalid_requests_are_atomic_and_preview_matches_save(client):
    before = len(s.all_of("workspace"))
    for changes in [
        {"data_count": 99},
        {"data_count": 0},
        {"data_count": 2, "train_budget": 2},
        {"method": "distribution", "data_count": 2, "reference_id": "missing"},
    ]:
        response = client.post(
            "/api/reconstructions", json={"name": "bad", "dataset_ids": ["d"]} | changes
        )
        assert response.status_code == 422
    assert len(s.all_of("workspace")) == before
    request = {
        "name": "new",
        "dataset_ids": ["d"],
        "method": "source_balanced",
        "data_count": 4,
    }
    preview = client.post("/api/reconstructions/preview", json=request).json()
    saved = client.post("/api/reconstructions", json=request)
    assert saved.status_code == 201
    assert saved.json()["count"] == saved.json()["splits"]["train"] == 4
    assert (
        saved.json()["splits"].get("validation", 0)
        == saved.json()["splits"].get("test", 0)
        == 0
    )
    assert saved.json()["fingerprint"] == preview["fingerprint"]


def test_merge_keeps_unlabeled_samples(client):
    original = s.get("dataset", "d")
    original["rows"][0]["label_state"] = "unlabeled"
    s.save("dataset", original)
    assert (
        len(
            reconstruct(
                Reconstruction(name="merge", dataset_ids=["d"], method="merge")
            )["rows"]
        )
        == 8
    )
    with pytest.raises(ValueError, match="미레이블"):
        reconstruct(body())
