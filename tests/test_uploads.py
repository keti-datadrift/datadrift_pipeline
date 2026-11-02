import io
import json
from pathlib import Path

import pytest
from PIL import Image

from backend.data import store as s
from backend.jobs import execution as job_execution
from backend.relabeling import convert
from backend.schemas import taxonomy as t


def image_bytes(color="red"):
    buffer = io.BytesIO()
    Image.new("RGB", (40, 40), color).save(buffer, format="PNG")
    return buffer.getvalue()


def upload(client, files=None, **params):
    return client.post(
        "/api/workspaces/w/images",
        params={"name": "업로드", "category": "상의", **params},
        files=files or [("files", ("one.png", image_bytes(), "image/png"))],
    )


def test_upload_persists_unlabeled_images_and_is_idempotent(client):
    response = upload(client)
    assert response.status_code == 201, response.text
    first = response.json()
    dataset = first["dataset"]
    assert dataset["unlabeled_count"] == 1 and dataset["labeled_count"] == 0
    stored = s.get("dataset", dataset["id"])
    row = stored["rows"][0]
    assert row["label_state"] == "unlabeled" and set(row["unscored_fields"]) == set(
        t.FIELDS
    )
    assert (
        not row["human_verified"] and Path(row["image"]).read_bytes() == image_bytes()
    )
    assert (
        client.get(f"/api/datasets/{dataset['id']}/images/{row['id']}").content
        == image_bytes()
    )
    assert upload(client).json()["duplicate"]
    assert len(list((s.ROOT / "uploads").iterdir())) == 1
    assert client.get(f"/api/datasets/{dataset['id']}").json()["unlabeled_count"] == 1
    for kind in ("training", "evaluation"):
        response = client.post(
            "/api/jobs",
            json={"kind": kind, "dataset_id": dataset["id"], "model_id": "qwen35_2b"},
        )
        assert response.status_code == 422 and "미레이블" in response.text
    assert (
        client.post(
            "/api/reconstructions/preview",
            json={
                "workspace_id": "w",
                "name": "x",
                "dataset_ids": [dataset["id"]],
                "train_budget": 1,
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "drift", "dataset_id": dataset["id"], "reference_id": "d"},
        ).status_code
        == 422
    )


def test_upload_atomic_failure_limits_and_duplicate_files(client, monkeypatch):
    before = len(s.all_of("dataset"))
    response = upload(
        client,
        [
            ("files", ("valid.png", image_bytes())),
            ("files", ("bad.png", b"not an image")),
        ],
    )
    assert response.status_code == 422 and len(s.all_of("dataset")) == before
    assert not list((s.ROOT / "uploads").iterdir())
    assert upload(client, category="invalid").status_code == 422
    response = upload(
        client,
        [("files", ("a.png", image_bytes())), ("files", ("b.png", image_bytes()))],
    )
    assert (
        response.json()["skipped_duplicates"] == 1
        and response.json()["dataset"]["count"] == 1
    )
    assert upload(
        client, [("files", ("two.png", image_bytes("blue")))], split="test"
    ).json()["dataset"]["splits"] == {"train": 1, "test": 1}
    from backend.data import uploads

    monkeypatch.setattr(uploads, "MAX_IMAGE", 20)
    assert upload(client).status_code == 422
    assert (
        client.post(
            "/api/workspaces/w/images?name=x&category=상의",
            content=b"x",
            headers={"Content-Type": "text/plain"},
        ).status_code
        == 415
    )
    monkeypatch.setattr(uploads, "MAX_BATCH", 1)
    response = upload(client, [("files", ("large.png", b"x" * (1024 * 1024 + 2)))])
    assert response.status_code == 413


def test_upload_db_failure_removes_only_new_assets(client, monkeypatch):
    first = upload(client).json()["dataset"]
    original = s.save

    def fail(kind, value, con=None):
        if kind == "dataset":
            raise RuntimeError("test write failure")
        return original(kind, value, con)

    monkeypatch.setattr(s, "save", fail)
    with pytest.raises(RuntimeError):
        upload(client, [("files", ("other.png", image_bytes("blue")))])
    assert len(list((s.ROOT / "uploads").iterdir())) == 1
    assert Path(s.get("dataset", first["id"])["rows"][0]["image"]).exists()


def test_model_selection_and_manual_labels(client, tmp_path):
    dataset = upload(client).json()["dataset"]
    did = dataset["id"]
    response = client.post(
        "/api/jobs",
        json={"kind": "labeling", "dataset_id": did, "model_id": "qwen35_2b"},
    )
    assert response.status_code == 201
    assert response.json()["request"]["model_id"] == "qwen35_2b"
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "labeling", "dataset_id": did, "model_id": "qwen35_2b"},
        ).status_code
        == 409
    )
    client.post("/api/jobs/" + response.json()["id"] + "/cancel")
    adapter = tmp_path / "adapter"
    adapter.mkdir()
    (adapter / "adapter_config.json").write_text("{}")
    (adapter / "adapter_model.safetensors").write_bytes(b"fixture")
    s.save(
        "model",
        {
            "id": "trained",
            "name": "학습 모델",
            "family": "qwen35_2b",
            "kind": "lora",
            "status": "ready",
            "adapter": str(adapter),
            "schema_id": t.CURRENT,
        },
    )
    assert any(m["id"] == "trained" for m in client.get("/api/labeling-models").json())
    response = client.post(
        "/api/jobs", json={"kind": "labeling", "dataset_id": did, "model_id": "trained"}
    )
    assert response.status_code == 201
    client.post("/api/jobs/" + response.json()["id"] + "/cancel")
    s.patch("model", "trained", status="archived")
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "labeling", "dataset_id": did, "model_id": "trained"},
        ).status_code
        == 422
    )
    s.patch("model", "trained", status="ready", schema_id=t.LEGACY)
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "labeling", "dataset_id": did, "model_id": "trained"},
        ).status_code
        == 422
    )
    row = s.get("dataset", did)["rows"][0]
    target = row["target"] | {"fit": t.schema(t.CURRENT, "상의")["fit"][0]}
    response = client.post(
        f"/api/datasets/{did}/samples/{row['id']}/labels",
        json={"target": target, "unscored_fields": [k for k in t.FIELDS if k != "fit"]},
    )
    assert response.status_code == 201
    assert response.json()["dataset"]["unlabeled_count"] == 0
    assert s.get("dataset", did)["rows"][0]["label_state"] == "unlabeled"
    converted = convert(
        row,
        json.dumps(target),
        {"created_at": "now", "model_name": "학습한 Qwen", "model_id": "trained"},
    )
    assert (
        converted["label_state"] == "labeled"
        and converted["label_source"] == "학습한 Qwen 자동 레이블링"
    )
    assert converted["ai_label"]["model_id"] == "trained"
    assert convert(row, "not JSON", {"created_at": "now"})["label_state"] == "unlabeled"


def test_worker_uses_selected_adapter_and_publishes_new_version(
    client, tmp_path, monkeypatch
):
    from backend import worker

    did = upload(client).json()["dataset"]["id"]
    adapter = tmp_path / "selected-adapter"
    adapter.mkdir()
    (adapter / "adapter_config.json").write_text("{}")
    (adapter / "adapter_model.safetensors").write_bytes(b"adapter")
    s.save(
        "model",
        {
            "id": "selected",
            "name": "선택 모델",
            "family": "qwen35_2b",
            "kind": "lora",
            "status": "ready",
            "adapter": str(adapter),
            "schema_id": t.CURRENT,
        },
    )
    response = client.post(
        "/api/jobs",
        json={"kind": "labeling", "dataset_id": did, "model_id": "selected"},
    )
    assert response.status_code == 201
    original = s.get("dataset", did)

    class Process:
        returncode = 0

        def __init__(self, command, **kwargs):
            assert command[2] == "backend.training"
            payload = json.loads(Path(command[-1]).read_text())
            assert payload["model"]["adapter"] == str(adapter)
            assert payload["model"]["id"] == "selected"
            assert payload["base_model"].endswith("Qwen3.5-2B")
            row = payload["rows"][0]
            target = row["target"] | {"fit": t.schema(t.CURRENT, "상의")["fit"][0]}
            metadata = {
                "created_at": "now",
                "model_id": "selected",
                "model_name": "선택 모델",
            }
            converted = convert(row, json.dumps(target), metadata)
            folder = Path(payload["output"])
            (folder / "relabeled-rows.json").write_text(json.dumps([converted]))
            (folder / "result.json").write_text(
                json.dumps(
                    {"count": 1, "teacher": metadata, "label_coverage": {"fit": 1}}
                )
            )
            (folder / "progress.json").write_text(
                json.dumps({"phase": "completed", "step": 1, "total": 1})
            )

        def poll(self):
            return 0

    monkeypatch.setattr(job_execution.subprocess, "Popen", Process)
    job = worker.claim()
    worker.run(job)
    completed = s.get("job", job["id"])
    assert completed["status"] == "succeeded"
    result = s.get("dataset", completed["result"]["dataset_id"])
    assert result["labeling_model_id"] == "selected" and result["labeled_count"] == 1
    assert result["rows"][0]["image"] == original["rows"][0]["image"]
    assert s.get("dataset", did) == original
