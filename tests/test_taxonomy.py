import copy
import pytest
from backend import taxonomy as t, store as s
from backend.migrate_taxonomy import convert
from backend.training import metrics


def row(scope="상의"):
    return {
        "id": "one",
        "category": scope,
        "label_source": "AI",
        "human_verified": False,
        "target": {
            "fit": "레귤러",
            "length": "기본",
            "sleeve": "반팔",
            "neckline": "라운드",
            "pattern": "무지",
            "details": ["배색라인"],
            "graphic_location": "없음",
            "surface_texture": "평활",
        },
        "unscored_fields": [],
    }


def test_workbook_values_and_category_rules():
    assert len(t.BOOK["colors"]) == 212
    assert len(t.BOOK["categories"]) == 64
    assert t.schema(t.CURRENT, "상의")["fit"] == [
        "슬림핏",
        "레귤러핏",
        "루즈핏",
        "오버핏",
        "unknown",
    ]
    assert "하프/버뮤다" in t.schema(t.CURRENT, "하의")["length"]
    assert t.schema(t.CURRENT, "하의")["sleeve"] == ["not_applicable"]
    assert "WT" in t.schema(t.CURRENT)["color_code"]
    assert next(c for c in t.BOOK["colors"] if c["code"] == "WT")["group"] == "베이지"
    with pytest.raises(ValueError):
        t.schema("nonexistent")


def test_mapping_retains_uncertainty_and_legacy():
    original = row()
    before = copy.deepcopy(original)
    changed = convert(original)
    assert original == before
    assert changed["target"]["fit"] == "레귤러핏"
    assert changed["target"]["sleeve"] == "반소매"
    assert changed["target"]["details"] == ["배색"]
    assert {"color_code", "origin", "fabric", "details"} <= set(
        changed["unscored_fields"]
    )
    assert changed["target"]["origin"] == changed["target"]["color_code"] == "unknown"
    assert not changed["human_verified"]
    assert t.valid(changed["target"], t.CURRENT, "상의")
    assert not t.valid(changed["target"], t.CURRENT, "하의")
    changed["target"]["fit"] = "레귤러"
    assert not t.valid(changed["target"], t.CURRENT, "상의")
    original["target"]["graphic_location"] = "가슴"
    assert convert(original)["target"]["pattern"] == "unknown"


def test_new_metrics_use_scope_and_exclude_unverified_labels():
    mapped = convert(row())
    result = metrics([mapped], [mapped["target"]], t.CURRENT)
    assert result["schema_failures"] == 0
    assert result["macro_attribute_accuracy"] == 1
    assert result["fields"]["origin"]["count"] == 0
    assert result["fields"]["details"]["count"] == 0
    malformed = mapped["target"] | {"fit": "레귤러"}
    assert metrics([mapped], [malformed], t.CURRENT)["schema_failures"] == 1


def test_mixed_versions_rejected_and_current_annotations_supported(client):
    d = s.get("dataset", "d")
    mapped = convert(row())
    new = copy.deepcopy(d) | {"id": "new", "schema_id": t.CURRENT}
    new["rows"] = [
        r
        | {
            "target": mapped["target"],
            "category": "상의",
            "schema_id": t.CURRENT,
            "unscored_fields": mapped["unscored_fields"],
        }
        for r in d["rows"]
    ]
    s.save("dataset", new)
    body = {
        "workspace_id": "w",
        "name": "mixed",
        "dataset_ids": ["d", "new"],
        "train_budget": 2,
    }
    assert client.post("/api/reconstructions", json=body).status_code == 422
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "drift", "dataset_id": "new", "reference_id": "d"},
        ).status_code
        == 422
    )
    saved = client.post(
        "/api/datasets/new/samples/0/labels",
        json={"target": mapped["target"], "unscored_fields": mapped["unscored_fields"]},
    )
    assert saved.status_code == 201
    assert saved.json()["dataset"]["schema_id"] == t.CURRENT
    model = s.get("model", "qwen35_2b") | {"id": "old-adapter", "kind": "lora"}
    s.save("model", model)
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "evaluation", "dataset_id": "new", "model_id": "old-adapter"},
        ).status_code
        == 422
    )


def test_migration_is_idempotent_and_can_target_imports(client):
    from backend.migrate_taxonomy import migrate

    d = s.get("dataset", "d")
    d["rows"] = [r | row() | {"id": r["id"]} for r in d["rows"]]
    s.save("dataset", d)
    first = migrate({"d"})
    assert len(first) == 1
    count = len(s.all_of("dataset"))
    assert migrate({"d"})[0]["id"] == first[0]["id"]
    assert len(s.all_of("dataset")) == count
    assert migrate(set()) == []
