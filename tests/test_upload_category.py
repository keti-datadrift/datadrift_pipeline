import copy
import json

from backend.data import store as s
from backend.data.uploads import empty_target
from backend.relabeling import convert, prompt
from backend.schemas import taxonomy as t
from tests.test_uploads import image_bytes


def uploaded(client):
    response = client.post(
        "/api/workspaces/w/images",
        params={"name": "mixed"},
        files=[("files", ("one.png", image_bytes(), "image/png"))],
    )
    assert response.status_code == 201, response.text
    return s.get("dataset", response.json()["dataset"]["id"])


def test_upload_requires_no_category_and_accepts_labeling_job(client):
    dataset = uploaded(client)
    row = dataset["rows"][0]
    assert row["category"] is None
    assert row["label_state"] == "unlabeled"
    assert set(row["unscored_fields"]) == set(t.FIELDS)
    request = client.post(
        "/api/jobs",
        json={"kind": "labeling", "dataset_id": dataset["id"], "model_id": "qwen35_2b"},
    )
    assert request.status_code == 201, request.text
    assert "category" in prompt(row)
    assert "category" in t.row_prompt("base", row, t.CURRENT)


def test_automatic_category_uses_scoped_schema_and_rejects_unknown_category(client):
    dataset = uploaded(client)
    row = dataset["rows"][0]
    before = copy.deepcopy(row)
    attrs = {
        key: [] if key == "details" else values[0]
        for key, values in t.schema(t.CURRENT, "하의").items()
    }
    inferred = convert(
        row,
        json.dumps(attrs | {"category": "하의"}, ensure_ascii=False),
        {"created_at": "now"},
    )
    assert inferred["category"] == "하의"
    assert inferred["ai_label"]["category_inferred"]
    assert inferred["ai_label"]["schema_valid"]
    assert t.valid(inferred["target"], t.CURRENT, "하의")
    assert row == before
    unknown = convert(
        row, json.dumps(attrs | {"category": "unknown"}), {"created_at": "now"}
    )
    assert unknown["category"] is None
    assert unknown["label_state"] == "unlabeled"
    assert set(unknown["unscored_fields"]) == set(t.FIELDS)
    assert not unknown["ai_label"]["schema_valid"]
    malformed = convert(
        row, json.dumps(attrs | {"category": ["상의"]}), {"created_at": "now"}
    )
    assert malformed["label_state"] == "unlabeled"


def test_manual_category_can_be_assigned_after_upload(client):
    dataset = uploaded(client)
    row = dataset["rows"][0]
    payload = {
        "target": empty_target("상의"),
        "unscored_fields": t.FIELDS,
        "human_verified": True,
    }
    path = f"/api/datasets/{dataset['id']}/samples/{row['id']}/labels"
    assert client.post(path, json=payload).status_code == 422
    saved = client.post(path, json=payload | {"category": "상의"})
    assert saved.status_code == 201, saved.text
    assert saved.json()["sample"]["category"] == "상의"
    assert s.get("dataset", dataset["id"])["rows"][0]["category"] is None
