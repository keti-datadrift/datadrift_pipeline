"""The restored labels stay in their original format until a user starts a job."""

import copy
import json
from pathlib import Path

from backend import worker
from backend.data import store as s
from backend.data import workspace_data as wd
from backend.jobs import execution as job_execution
from backend.relabeling import convert, prompt
from backend.schemas import taxonomy as t
from tests.test_uploads import image_bytes


def legacy_row(row):
    return row | {
        "category": "상의",
        "target": {k: [] if k == "details" else "unknown" for k in t.LEGACY_SCHEMA}
        | {"fit": "레귤러"},
        "human_verified": True,
        "label_source": "Codex",
        "unscored_fields": [k for k in t.LEGACY_SCHEMA if k != "fit"],
    }


def test_legacy_predictions_preserve_format_and_raw_history():
    before = legacy_row({"id": "original"})
    original = copy.deepcopy(before)
    predicted = before["target"] | {"fit": "루즈", "details": ["후드"]}
    assert "14개" in prompt(before, t.LEGACY)
    assert "Codex" not in prompt(before, t.LEGACY)
    after = convert(
        before,
        json.dumps(predicted),
        {"created_at": "now", "model_name": "selected"},
        t.LEGACY,
    )
    assert before == original
    assert after["schema_id"] == t.LEGACY
    assert after["category"] == "상의"
    assert after["target"] == predicted
    assert after["ai_label"]["schema_valid"]
    assert after["label_history"][-1]["before"]["target"] == original["target"]
    assert not after["human_verified"]
    broken = convert(before, "invalid JSON", {"created_at": "now"}, t.LEGACY)
    assert set(broken["unscored_fields"]) == set(t.LEGACY_SCHEMA)
    assert broken["label_state"] == "unlabeled"
    assert t.valid(broken["target"], t.LEGACY)


def test_legacy_upload_appends_without_migrating_existing_labels(client):
    original = s.get("dataset", "d")
    original["rows"] = [legacy_row(row) for row in original["rows"]]
    with s.db() as con:
        wd.publish(original, con)
    response = client.post(
        "/api/workspaces/w/images",
        params={"name": "mixed"},
        files=[("files", ("new.png", image_bytes(), "image/png"))],
    )
    assert response.status_code == 201, response.text
    saved = s.get("dataset", response.json()["dataset"]["id"])
    assert saved["schema_id"] == t.LEGACY
    assert saved["rows"][:-1] == original["rows"]
    assert s.get("dataset", "d") == original
    added = saved["rows"][-1]
    assert added["category"] is None and added["schema_id"] == t.LEGACY
    assert added["label_state"] == "unlabeled"
    assert set(added["unscored_fields"]) == set(t.LEGACY_SCHEMA)
    assert t.valid(added["target"], t.LEGACY)


def test_label_models_and_jobs_match_dataset_schema(client, tmp_path):
    adapter = tmp_path / "adapter"
    adapter.mkdir()
    (adapter / "adapter_config.json").write_text("{}")
    (adapter / "adapter_model.safetensors").write_bytes(b"test")
    for schema in (t.CURRENT, t.LEGACY):
        s.save(
            "model",
            {
                "id": schema,
                "name": schema,
                "kind": "lora",
                "family": "qwen35_2b",
                "status": "ready",
                "adapter": str(adapter),
                "schema_id": schema,
            },
        )
    assert t.LEGACY in {
        m["id"] for m in client.get("/api/labeling-models?schema_id=visual-v1").json()
    }
    assert t.CURRENT not in {
        m["id"] for m in client.get("/api/labeling-models?schema_id=visual-v1").json()
    }
    assert t.LEGACY not in {m["id"] for m in client.get("/api/labeling-models").json()}
    assert client.get("/api/labeling-models?schema_id=unsupported").status_code == 422
    original = s.get("dataset", "d")
    wrong = client.post(
        "/api/jobs", json={"kind": "labeling", "dataset_id": "d", "model_id": t.CURRENT}
    )
    assert wrong.status_code == 422
    accepted = client.post(
        "/api/jobs", json={"kind": "labeling", "dataset_id": "d", "model_id": t.LEGACY}
    )
    assert accepted.status_code == 201, accepted.text
    assert s.get("dataset", "d") == original


def test_legacy_worker_publishes_same_schema_and_keeps_original(client, monkeypatch):
    original = s.get("dataset", "d")
    original["rows"] = [legacy_row(row) for row in original["rows"]]
    with s.db() as con:
        wd.publish(original, con)
    s.patch("workspace", "w", labeling_model_id="old")
    request = client.post(
        "/api/jobs",
        json={"kind": "labeling", "dataset_id": "d", "model_id": "qwen35_2b"},
    )
    assert request.status_code == 201

    class Process:
        returncode = 0

        def __init__(self, command, **kwargs):
            payload = json.loads(Path(command[-1]).read_text())
            assert payload["schema_id"] == t.LEGACY
            out = Path(payload["output"])
            rows = [
                convert(
                    row,
                    json.dumps(row["target"] | {"fit": "루즈"}),
                    {"created_at": "now", "model_name": "Qwen"},
                    payload["schema_id"],
                )
                for row in payload["rows"]
            ]
            (out / "relabeled-rows.json").write_text(json.dumps(rows))
            (out / "result.json").write_text(
                json.dumps({"teacher": {}, "label_coverage": {"fit": len(rows)}})
            )
            (out / "progress.json").write_text(json.dumps({"step": len(rows)}))

        def poll(self):
            return 0

    monkeypatch.setattr(job_execution.subprocess, "Popen", Process)
    worker.run(worker.claim())
    with s.db() as con:
        current = wd.current("w", con)
    assert current["schema_id"] == t.LEGACY
    assert all(row["target"]["fit"] == "루즈" for row in current["rows"])
    assert s.get("dataset", "d") == original
    assert s.get("workspace", "w")["labeling_model_id"] == "qwen35_2b"
