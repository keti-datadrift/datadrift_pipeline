import copy
from pathlib import Path

import pytest

from backend.data import store as s
from tests.test_uploads import upload


def remove(client, kind="dataset", key="d", sample_ids=None):
    body = {"kind": kind, "id": key, "sample_ids": sample_ids or []}
    response = client.post("/api/deletions/preview", json=body)
    if response.status_code != 200:
        return response
    return client.post(
        "/api/deletions", json=body | {"token": response.json()["token"]}
    )


def test_dataset_delete_restore_preserves_files_models_and_history(client):
    d = upload(client).json()["dataset"]
    did = d["id"]
    original = copy.deepcopy(s.get("dataset", did))
    path = Path(original["rows"][0]["image"])
    s.save(
        "job",
        {
            "id": "done",
            "status": "succeeded",
            "request": {"kind": "labeling", "dataset_id": did},
            "result": {"count": 1},
        },
    )
    s.save("model", {"id": "trained", "dataset_id": did})
    deleted = remove(client, key=did)
    assert deleted.status_code == 201, deleted.text
    for suffix in ("", "/samples", "/export", "/images/" + original["rows"][0]["id"]):
        assert client.get(f"/api/datasets/{did}{suffix}").status_code == 404
    assert did not in {d["id"] for d in client.get("/api/datasets").json()}
    assert path.is_file()
    assert s.get("job", "done")["result"] == {"count": 1}
    assert s.get("model", "trained")["dataset_id"] == did
    assert (
        client.post(
            "/api/jobs", json={"kind": "labeling", "dataset_id": did}
        ).status_code
        == 404
    )
    batch = deleted.json()["id"]
    assert client.post(f"/api/deletions/{batch}/restore").status_code == 200
    assert s.get("dataset", did) == original
    assert (
        client.get(
            f"/api/datasets/{did}/images/{original['rows'][0]['id']}"
        ).status_code
        == 200
    )
    assert client.get("/api/deletions").json() == []
    assert client.post(f"/api/deletions/{batch}/restore").status_code == 404


@pytest.mark.parametrize("status", ["queued", "running"])
@pytest.mark.parametrize("field", ["dataset_id", "reference_id"])
def test_active_jobs_block_all_deletions_atomically(client, status, field):
    s.save(
        "job",
        {
            "id": "active",
            "status": status,
            "cancel_requested": True,
            "request": {"kind": "drift", field: "d"},
        },
    )
    for kind, key, ids in [
        ("dataset", "d", []),
        ("workspace", "w", []),
        ("samples", "d", ["0"]),
    ]:
        response = remove(client, kind, key, ids)
        assert response.status_code == 409
        assert "작업 종료" in response.text
    assert len(s.get("dataset", "d")["rows"]) == 12
    assert client.get("/api/deletions").json() == []


def test_stale_preview_and_new_job_between_preview_and_delete(client):
    body = {"kind": "workspace", "id": "w"}
    token = client.post("/api/deletions/preview", json=body).json()["token"]
    s.save("dataset", s.get("dataset", "d") | {"id": "new"})
    assert (
        client.post("/api/deletions", json=body | {"token": token}).status_code == 409
    )
    token = client.post("/api/deletions/preview", json=body).json()["token"]
    s.save("job", {"id": "new-job", "status": "queued", "request": {"dataset_id": "d"}})
    assert (
        client.post("/api/deletions", json=body | {"token": token}).status_code == 409
    )
    assert len(s.all_of("dataset")) == 2
    assert (
        client.post("/api/deletions", json={"kind": "dataset", "id": "new"}).status_code
        == 409
    )


def test_sample_delete_keeps_immutable_snapshot_and_restore(client):
    original = copy.deepcopy(s.get("dataset", "d"))
    result = remove(client, "samples", "d", ["0", "1", "1"])
    assert result.status_code == 201, result.text
    data = result.json()
    assert data["sample_count"] == 2
    replacement = s.get("dataset", data["dataset"]["id"])
    assert len(replacement["rows"]) == 10
    assert replacement["fingerprint"] != original["fingerprint"]
    assert replacement["parent_ids"] == ["d"]
    assert client.get("/api/datasets/d").status_code == 404
    assert client.post(f"/api/deletions/{data['id']}/restore").status_code == 200
    assert s.get("dataset", "d") == original
    assert s.get("dataset", replacement["id"]) == replacement
    head = client.get("/api/datasets?current=true").json()[0]["id"]
    assert remove(client, "samples", head, ["missing"]).status_code == 422
    assert remove(client, "samples", head, []).status_code == 422
    result = remove(client, "samples", head, [str(i) for i in range(12)])
    assert result.status_code == 201 and result.json()["dataset"] is None


def test_workspace_restore_order_and_other_workspaces(client):
    s.save("workspace", {"id": "other", "name": "other"})
    child = s.get("dataset", "d") | {
        "id": "child",
        "workspace_id": "other",
        "parent_ids": ["d"],
    }
    s.save("dataset", child)
    deleted_dataset = remove(client).json()
    deleted_workspace = remove(client, "workspace", "w").json()
    assert (
        client.post(f"/api/deletions/{deleted_dataset['id']}/restore").status_code
        == 409
    )
    assert client.patch("/api/workspaces/w", json={"name": "new"}).status_code == 404
    assert upload(client).status_code == 404
    assert s.get("dataset", "child") == child
    assert (
        client.post(f"/api/deletions/{deleted_workspace['id']}/restore").status_code
        == 200
    )
    assert (
        client.post(f"/api/deletions/{deleted_dataset['id']}/restore").status_code
        == 200
    )
    result = remove(client, "workspace", "w").json()
    assert result["dataset_count"] == 1 and result["sample_count"] == 12
    assert s.get("workspace", "other") and s.get("dataset", "child")
    assert client.post(f"/api/deletions/{result['id']}/restore").status_code == 200
    assert len(s.get("dataset", "d")["rows"]) == 12


def test_restore_rolls_back_all_objects_on_failure(client, monkeypatch):
    deletion = remove(client, "workspace", "w").json()
    original_save = s.save

    def fail(kind, obj, con=None):
        if kind == "workspace":
            raise RuntimeError("test failure")
        return original_save(kind, obj, con)

    monkeypatch.setattr(s, "save", fail)
    with pytest.raises(RuntimeError):
        client.post(f"/api/deletions/{deletion['id']}/restore")
    assert client.get("/api/datasets/d").status_code == 404
    assert len(client.get("/api/deletions").json()) == 1
    monkeypatch.setattr(s, "save", original_save)
    assert client.post(f"/api/deletions/{deletion['id']}/restore").status_code == 200
