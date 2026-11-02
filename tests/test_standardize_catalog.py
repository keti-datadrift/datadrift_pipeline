import copy

import pytest

from backend import standardize_catalog as migration
from backend.data import store as s
from backend.data import workspace_data as wd
from backend.schemas import taxonomy as t
from tests.test_taxonomy import row


def seed():
    original = s.get("dataset", "d")
    original["rows"] = [r | row() | {"id": r["id"]} for r in original["rows"]]
    original["rows"][0]["split"] = "test"
    reference = wd.revision(
        original, [migration.convert(r) for r in original["rows"]], schema_id=t.CURRENT
    )
    reference["created_at"] = "2026-10-27T00:00:00Z"
    reference["rows"][0]["split"] = "train"  # The current split must win.
    original["rows"][1]["target"]["fit"] = "루즈"
    original["rows"][1]["human_verified"] = True
    original["rows"][1]["label_history"] = [
        {
            "at": "2026-10-29T00:00:00Z",
            "channel": "manual_web_or_api",
            "note": "사용자 수정",
        }
    ]
    with s.db() as con:
        s.save("dataset", reference, con)
        wd.publish(original, con)
        s.save(
            "model",
            {
                "id": "old",
                "kind": "lora",
                "family": "qwen35_2b",
                "name": "old",
                "status": "ready",
            },
            con,
        )
        s.save(
            "model",
            {
                "id": "current",
                "kind": "lora",
                "family": "qwen35_2b",
                "schema_id": t.CURRENT,
                "name": "current",
                "status": "ready",
            },
            con,
        )
    return copy.deepcopy(original), copy.deepcopy(reference)


def test_default_attributes_retirement_and_preserved_user_state(client):
    original, reference = seed()
    result = migration.apply()
    assert result["retired_model_ids"] == ["old"]
    with s.db() as con:
        active = wd.current("w", con)
    assert active["schema_id"] == t.CURRENT
    assert [(r["id"], r["sha256"], r["split"]) for r in active["rows"]] == [
        (r["id"], r["sha256"], r["split"]) for r in original["rows"]
    ]
    assert active["rows"][1]["target"]["fit"] == "루즈핏"
    assert active["rows"][1]["label_history"][0]["note"] == "사용자 수정"
    assert (
        active["rows"][1]["human_verified"] is False
    )  # New attributes were not reviewed.
    assert active["rows"][0]["target"] == reference["rows"][0]["target"]
    assert s.get("dataset", original["id"]) == original
    assert s.get("dataset", reference["id"]) == reference
    assert s.get("model", "old")["status"] == "archived"
    assert s.get("model", "current")["status"] == "ready"
    assert client.get("/api/models/old").status_code == 404
    assert client.patch("/api/models/old", json={"name": "restore"}).status_code == 404
    assert "old" not in {m["id"] for m in client.get("/api/models?summary=true").json()}
    assert (
        client.post(
            "/api/jobs",
            json={
                "kind": "evaluation",
                "model_id": "old",
                "dataset_id": original["id"],
            },
        ).status_code
        == 422
    )
    assert set(t.schema()) == set(t.FIELDS)
    assert migration.apply() == {"retired_model_ids": [], "datasets": []}


def test_pending_work_blocks_migration_atomically(client):
    original, _ = seed()
    s.save("job", {"id": "running", "status": "running"})
    with pytest.raises(ValueError, match="실행 중"):
        migration.apply()
    assert s.get("model", "old")["status"] == "ready"
    with s.db() as con:
        assert wd.current("w", con) == original
