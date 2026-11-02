import pytest

from backend import relabeling
from backend.data import store as s
from backend.data import workspace_data as wd
from backend.jobs import execution as job_execution
from backend.schemas import taxonomy as t


def teacher(tmp_path, monkeypatch):
    monkeypatch.setattr(relabeling, "TEACHER", tmp_path)
    (tmp_path / "config.json").write_text("{}")


def test_workspace_model_create_edit_clear_and_validation(
    client, tmp_path, monkeypatch
):
    teacher(tmp_path, monkeypatch)
    response = client.post(
        "/api/workspaces",
        json={"name": "configured", "labeling_model_id": "gemma4_teacher"},
    )
    assert response.status_code == 201
    wid = response.json()["id"]

    def listed():
        return next(w for w in client.get("/api/workspaces").json() if w["id"] == wid)

    assert listed()["labeling_model_name"] == "Gemma-4-12B"
    assert (
        client.patch(f"/api/workspaces/{wid}", json={"name": "renamed"}).status_code
        == 200
    )
    assert listed()["labeling_model_id"] == "gemma4_teacher"
    assert (
        client.patch(
            f"/api/workspaces/{wid}",
            json={"name": "renamed", "labeling_model_id": "missing"},
        ).status_code
        == 404
    )
    assert listed()["labeling_model_id"] == "gemma4_teacher"
    assert (
        client.patch(
            f"/api/workspaces/{wid}",
            json={"name": "renamed", "labeling_model_id": None},
        ).status_code
        == 200
    )
    assert listed()["labeling_model_id"] is None


def test_legacy_provenance_and_explicit_clear(client):
    d = s.get("dataset", "d")
    d["labeling_model_id"] = "gemma4_teacher"
    with s.db() as con:
        wd.publish(d, con)
    w = client.get("/api/workspaces").json()[0]
    assert w["labeling_model_id"] == "gemma4_teacher"
    assert w["labeling_model_name"] == "Gemma-4-12B"
    client.patch("/api/workspaces/w", json={"name": "test", "labeling_model_id": None})
    assert client.get("/api/workspaces").json()[0]["labeling_model_id"] is None
    assert s.get("dataset", "d")["labeling_model_id"] == "gemma4_teacher"


def test_label_job_uses_workspace_setting_and_remembers_selection(
    client, tmp_path, monkeypatch
):
    teacher(tmp_path, monkeypatch)
    d = s.get("dataset", "d")
    d["schema_id"] = t.CURRENT
    for row in d["rows"]:
        row["category"] = "상의"
    s.save("dataset", d)
    client.patch(
        "/api/workspaces/w",
        json={"name": "test", "labeling_model_id": "gemma4_teacher"},
    )
    response = client.post("/api/jobs", json={"kind": "labeling", "dataset_id": "d"})
    assert response.status_code == 201, response.text
    assert response.json()["request"]["model_id"] == "gemma4_teacher"
    assert s.get("workspace", "w")["labeling_model_id"] == "gemma4_teacher"
    # A rejected request must not change the setting.
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "labeling", "dataset_id": "d", "model_id": "missing"},
        ).status_code
        == 404
    )
    assert s.get("workspace", "w")["labeling_model_id"] == "gemma4_teacher"


@pytest.mark.parametrize("outcome", ["success", "failed", "cancelled", "partial"])
def test_model_changes_only_after_complete_publication(
    client, tmp_path, monkeypatch, outcome
):
    import json
    from pathlib import Path

    from backend import worker

    teacher(tmp_path, monkeypatch)
    d = s.get("dataset", "d")
    d.update(schema_id=t.CURRENT)
    for row in d["rows"]:
        row["category"] = "상의"
    with s.db() as con:
        wd.publish(d, con)
    s.patch("workspace", "w", labeling_model_id="old-model")
    response = client.post(
        "/api/jobs",
        json={"kind": "labeling", "dataset_id": "d", "model_id": "gemma4_teacher"},
    )
    assert response.status_code == 201
    assert s.get("workspace", "w")["labeling_model_id"] == "old-model"
    job = worker.claim()
    if outcome == "cancelled":
        s.patch("job", job["id"], cancel_requested=True)
    if outcome == "partial":
        active = s.get("dataset", "d")
        import copy

        rows = copy.deepcopy(active["rows"])
        rows[0]["human_verified"] = True
        with s.db() as con:
            wd.publish(wd.revision(active, rows, kind="annotation"), con)

    class Process:
        returncode = 1 if outcome == "failed" else 0

        def __init__(self, command, **kwargs):
            payload = json.loads(Path(command[-1]).read_text())
            folder = Path(payload["output"])
            (folder / "relabeled-rows.json").write_text(json.dumps(payload["rows"]))
            (folder / "result.json").write_text(
                json.dumps({"teacher": {}, "label_coverage": {}})
            )
            (folder / "progress.json").write_text(
                json.dumps({"step": len(payload["rows"])})
            )

        def poll(self):
            return self.returncode

    monkeypatch.setattr(job_execution.subprocess, "Popen", Process)
    if outcome == "failed":
        with pytest.raises(RuntimeError):
            worker.run(job)
    else:
        worker.run(job)
    assert s.get("workspace", "w")["labeling_model_id"] == (
        "gemma4_teacher" if outcome == "success" else "old-model"
    )
