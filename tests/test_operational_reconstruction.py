import pytest

from backend.api import Reconstruction, reconstruct
from backend.data import store as s
from backend.schemas import taxonomy as t
from tests.test_balanced_mix import dataset
from tests.test_uploads import image_bytes


def inputs():
    old, new = dataset("old", 3, 4), dataset("operating", 3, 10)
    for r in new["rows"]:
        r["split"] = "unassigned"
    for d in [old, new]:
        d["rows"] += [
            d["rows"][0]
            | {
                "id": d["id"] + "-holdout-" + split,
                "sha256": d["id"] + "-holdout-" + split,
                "split": split,
            }
            for split in ["validation", "test"]
        ]
        s.save("workspace", {"id": d["workspace_id"], "name": d["name"]})
        s.save("dataset", d)
    return old, new


@pytest.mark.parametrize(
    "method", ["balanced_mix", "random", "source_balanced", "distribution", "merge"]
)
def test_operating_candidates_are_selected_as_training_output_without_changing_sources(
    client, method
):
    old, new = inputs()
    body = Reconstruction(
        name="mixed",
        dataset_ids=["old", "operating"],
        method=method,
        data_count=None if method == "merge" else 6,
        reference_id="old" if method == "distribution" else None,
    )
    result = reconstruct(body)
    assert len(result["rows"]) == (14 if method == "merge" else 6)
    assert all(
        r["split"] == "train" and "holdout" not in r["id"] for r in result["rows"]
    )
    promoted = [r for r in result["rows"] if r.get("source_split") == "unassigned"]
    assert len(promoted) == result["selection"]["promoted_count"]
    assert len(promoted) > 0
    assert result["selection"]["input_splits"] == ["train", "unassigned"]
    if method == "balanced_mix":
        assert len(promoted) == 3
    assert s.get("dataset", "old") == old and s.get("dataset", "operating") == new
    payload = body.model_dump(exclude_none=True)
    preview = client.post("/api/reconstructions/preview", json=payload).json()
    saved = client.post("/api/reconstructions", json=payload)
    assert saved.status_code == 201, saved.text
    assert preview["fingerprint"] == saved.json()["fingerprint"]


def test_unlabeled_operating_images_can_merge_but_cannot_train_or_match_attributes(
    client,
):
    _, new = inputs()
    for r in new["rows"]:
        if r["split"] == "unassigned":
            r["label_state"] = "unlabeled"
    s.save("dataset", new)
    body = {"name": "pending", "dataset_ids": ["operating"], "data_count": 4}
    assert client.post("/api/reconstructions/preview", json=body).status_code == 422
    unused = client.post(
        "/api/reconstructions/preview",
        json=body
        | {
            "dataset_ids": ["old", "operating"],
            "dataset_weights": {"old": 100, "operating": 0},
        },
    )
    assert unused.status_code == 200, unused.text
    assert unused.json()["selection"]["promoted_count"] == 0
    result = client.post(
        "/api/reconstructions",
        json={"name": "pending", "dataset_ids": ["operating"], "method": "merge"},
    )
    assert result.status_code == 201, result.text
    assert result.json()["count"] == result.json()["splits"]["train"] == 10
    queued = client.post(
        "/api/jobs",
        json={
            "kind": "training",
            "dataset_id": result.json()["id"],
            "model_id": "qwen35_2b",
        },
    )
    assert queued.status_code == 422 and "미레이블" in queued.text


def test_operating_upload_label_reconstruct_training_request_and_review_cancel(client):
    uploaded = client.post(
        "/api/workspaces/w/images",
        params={"name": "operating", "split": "unassigned"},
        files=[("files", ("new.png", image_bytes(), "image/png"))],
    )
    assert uploaded.status_code == 201, uploaded.text
    d = uploaded.json()["dataset"]
    row = s.get("dataset", d["id"])["rows"][0]
    assert d["splits"] == {"unassigned": 1}
    assert (
        client.get(f"/api/datasets/{d['id']}/samples?split=unassigned").json()["total"]
        == 1
    )
    target = {key: [] if key == "details" else "unknown" for key in t.FIELDS}
    target["fit"] = "레귤러핏"
    saved = client.post(
        f"/api/datasets/{d['id']}/samples/{row['id']}/labels",
        json={
            "target": target,
            "unscored_fields": [k for k in target if k != "fit"],
            "category": "상의",
            "human_verified": True,
            "split": "unassigned",
        },
    )
    assert saved.status_code == 201, saved.text
    ready = saved.json()["dataset"]
    assert ready["splits"] == {"unassigned": 1}
    cancelled = client.delete(f"/api/datasets/{ready['id']}/samples/{row['id']}/review")
    assert cancelled.status_code == 200
    assert cancelled.json()["sample"]["split"] == "unassigned"
    ready = cancelled.json()["dataset"]
    rejected = client.post(
        "/api/jobs",
        json={"kind": "training", "dataset_id": ready["id"], "model_id": "qwen35_2b"},
    )
    assert rejected.status_code == 422 and "split" in rejected.text
    result = client.post(
        "/api/reconstructions",
        json={
            "name": "ready for training",
            "dataset_ids": [ready["id"]],
            "data_count": 1,
        },
    )
    assert result.status_code == 201, result.text
    assert result.json()["splits"] == {"train": 1}
    queued = client.post(
        "/api/jobs",
        json={
            "kind": "training",
            "dataset_id": result.json()["id"],
            "model_id": "qwen35_2b",
            "max_steps": 1,
        },
    )
    assert queued.status_code == 201, queued.text
    assert s.get("dataset", ready["id"])["rows"][0]["split"] == "unassigned"


def test_same_image_across_training_and_operating_deduplicates_but_holdout_overlap_is_rejected(
    client,
):
    old, new = inputs()
    new["rows"][0]["sha256"] = old["rows"][0]["sha256"]
    s.save("dataset", new)
    r = reconstruct(
        Reconstruction(name="dedup", dataset_ids=["old", "operating"], method="merge")
    )
    assert len(r["rows"]) == len({r["sha256"] for r in r["rows"]}) == 13
    new["rows"][0]["sha256"] = old["rows"][-1]["sha256"]
    s.save("dataset", new)
    with pytest.raises(ValueError, match="conflicting"):
        reconstruct(
            Reconstruction(
                name="no leakage", dataset_ids=["old", "operating"], method="merge"
            )
        )


def test_legacy_count_requests_still_keep_only_original_training_and_holdouts(client):
    inputs()
    r = reconstruct(
        Reconstruction(name="legacy", dataset_ids=["old", "operating"], train_budget=3)
    )
    assert len(r["rows"]) == 7
    assert all(row["split"] != "unassigned" for row in r["rows"])
    assert r["selection"]["input_splits"] == ["train"]
