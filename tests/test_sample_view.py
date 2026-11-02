import copy

import pytest

from backend.data import store as s
from backend.data.sample_view import INITIAL_MODEL_NAMES, public_sample


@pytest.mark.parametrize("source", INITIAL_MODEL_NAMES)
def test_original_display_attribution_is_read_only_and_not_a_new_review(source):
    row = {
        "product_id": "product",
        "image": "/private/original/shirt.webp",
        "label_source": source,
        "human_verified": False,
    }
    before = copy.deepcopy(row)
    display = public_sample(row)
    assert display["filename"] == "shirt.webp"
    assert display["initial_label"] == {"model_name": "GPT-Astra", "at": None}
    assert display["ai_labeled"] and not display["human_verified"]
    assert "label_history" not in display
    assert "image" not in display and row == before


def test_uploaded_filename_and_config_do_not_imply_ai_completion():
    row = {
        "product_id": "product",
        "image": "/uploads/hash.png",
        "upload_filename": r"C:\fakepath\original-name.png",
        "label_state": "unlabeled",
        "label_source": "미레이블",
        "labeling_model_id": "qwen35_2b",
    }
    display = public_sample(row)
    assert display["filename"] == "original-name.png"
    assert not display["ai_labeled"] and "initial_label" not in display
    row.update(label_state="labeled", label_source="수동 레이블", human_verified=True)
    assert not public_sample(row)["ai_labeled"]


def test_original_attribution_and_later_actual_model_are_distinct():
    row = {
        "product_id": "product",
        "image": "/source/image.jpg",
        "original_label_source": next(iter(INITIAL_MODEL_NAMES)),
        "label_source": "Other model 자동 레이블링",
        "label_state": "labeled",
        "label_history": [
            {
                "at": "2026-10-29T01:00:00+00:00",
                "channel": "ai_relabel",
                "teacher": {"model_name": "Other model"},
            }
        ],
    }
    before = copy.deepcopy(row)
    display = public_sample(row)
    assert display["initial_label"]["model_name"] == "GPT-Astra"
    assert display["label_history"][-1]["teacher"]["model_name"] == "Other model"
    assert row == before
    row["label_state"] = "unlabeled"
    assert not public_sample(row)["ai_labeled"]


def test_list_detail_and_manual_save_keep_filename_and_initial_source(client):
    d = s.get("dataset", "d")
    r = d["rows"][0]
    r.update(
        image="/original/real-file-name.jpg",
        label_source=next(iter(INITIAL_MODEL_NAMES)),
    )
    s.save("dataset", d)
    listed = client.get("/api/datasets/d/samples?limit=1").json()["items"][0]
    detail = client.get("/api/datasets/d/samples/0").json()
    assert listed == detail
    assert detail["filename"] == "real-file-name.jpg"
    assert detail["initial_label"]["model_name"] == "GPT-Astra"
    from backend.schemas import taxonomy as t

    target = {k: [] if k == "details" else "unknown" for k in t.LEGACY_SCHEMA}
    target["fit"] = "레귤러"
    saved = client.post(
        "/api/datasets/d/samples/0/labels",
        json={
            "target": target,
            "unscored_fields": [k for k in target if k != "fit"],
            "human_verified": True,
        },
    )
    assert saved.status_code == 201, saved.text
    display = saved.json()["sample"]
    assert display["filename"] == "real-file-name.jpg"
    assert display["ai_labeled"] and display["human_verified"]
    assert display["initial_label"]["model_name"] == "GPT-Astra"
    assert display["label_history"][-1]["channel"] == "manual_web_or_api"
    assert s.get("dataset", "d") == d
