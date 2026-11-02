import copy

from backend.data import store as s
from backend.data import workspace_data as wd
from backend.schemas import taxonomy as t


def tracked():
    original = s.get("dataset", "d")
    for row in original["rows"]:
        row["target"] = {
            field: [] if field == "details" else values[0]
            for field, values in t.schema(t.LEGACY).items()
        }
    with s.db() as con:
        wd.publish(original, con)
    return copy.deepcopy(original)


def move(client, did="d", ids=None, split="test"):
    return client.post(
        f"/api/datasets/{did}/samples/split",
        json={
            "sample_ids": ids if ids is not None else ["0", "1"],
            "split": split,
        },
    )


def test_bulk_split_preserves_original_labels_and_updates_counts(client):
    original = tracked()
    result = move(client, ids=["0", "1", "1"])
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["changed_count"] == 2
    assert data["dataset"]["splits"] == {"train": 6, "validation": 2, "test": 4}
    active = s.get("dataset", data["dataset"]["id"])
    for before, after in zip(original["rows"], active["rows"], strict=False):
        assert {
            k: v for k, v in after.items() if k not in ("split", "split_history")
        } == {k: v for k, v in before.items() if k not in ("split", "split_history")}
        if before["id"] in ["0", "1"]:
            assert after["split"] == "test"
            assert after["split_history"][-1]["before"] == "train"
        else:
            assert before == after
    assert s.get("dataset", "d") == original
    with s.db() as con:
        assert wd.current("w", con)["id"] == active["id"]
    repeat = move(client, active["id"]).json()
    assert repeat["changed_count"] == 0
    assert repeat["dataset"]["id"] == active["id"]
    assert (
        client.get(f"/api/datasets/{active['id']}/samples?split=test").json()["total"]
        == 4
    )


def test_bulk_rejects_stale_invalid_and_missing_selection_atomically(client):
    tracked()
    assert move(client, ids=[]).status_code == 422
    assert move(client, split="val").status_code == 422
    assert move(client, ids=["0", "missing"]).status_code == 404
    with s.db() as con:
        assert wd.current("w", con)["id"] == "d"
    latest = move(client).json()["dataset"]
    assert move(client, split="validation").status_code == 409
    with s.db() as con:
        wd.point("w", None, con)
    assert move(client, latest["id"]).status_code == 409


def test_detail_split_save_review_and_conflict(client):
    original = tracked()
    row = original["rows"][0]
    body = {"target": row["target"], "human_verified": True, "split": "validation"}
    result = client.post("/api/datasets/d/samples/0/labels", json=body)
    assert result.status_code == 201, result.text
    updated = result.json()
    assert updated["sample"]["split"] == "validation"
    assert updated["sample"]["human_verified"]
    assert updated["dataset"]["splits"]["validation"] == 3
    assert s.get("dataset", "d") == original
    did = updated["dataset"]["id"]
    assert move(client, did, ["0"], "test").status_code == 200
    assert (
        client.post(f"/api/datasets/{did}/samples/0/labels", json=body).status_code
        == 409
    )
    # Older clients that do not submit a split preserve the latest split.
    body.pop("split")
    result = client.post(f"/api/datasets/{did}/samples/0/labels", json=body)
    assert result.status_code == 201
    assert result.json()["sample"]["split"] == "test"


def test_labeling_completion_preserves_split_changes(client):
    source = tracked()
    moved = move(client).json()["dataset"]
    rows = copy.deepcopy(source["rows"])
    for row in rows:
        row["label_source"] = "test model"
    labeled = wd.revision(
        source, rows, labeling_job_id="job", labeling_model_id="model"
    )
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        active, applied = wd.apply_labels(source, labeled, con)
    assert applied == 12
    assert active["rows"][0]["split"] == "test"
    assert active["rows"][0]["split_history"][-1]["after"] == "test"
    assert all(row["label_source"] == "test model" for row in active["rows"])
    assert s.get("dataset", "d") == source
    assert s.get("dataset", moved["id"])["rows"][0]["split"] == "test"
