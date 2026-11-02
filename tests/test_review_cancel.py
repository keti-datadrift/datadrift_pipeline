import copy

from backend.data import store as s
from backend.data import workspace_data as wd


def reviewed(client):
    d = s.get("dataset", "d")
    d["rows"][0].update(
        human_verified=True,
        reviewed_at="2026-10-29T01:00:00+00:00",
        label_source="수동 레이블 · 사용자 검토 완료",
        original_label_source="Codex primary agent, direct visual inspection",
        label_state="labeled",
        ai_label={"raw": "original prediction"},
    )
    with s.db() as con:
        wd.publish(d, con)
    return d


def test_cancel_review_keeps_labels_and_original_and_updates_counts(client):
    d = reviewed(client)
    before = copy.deepcopy(d["rows"][0])
    response = client.delete("/api/datasets/d/samples/0/review")
    assert response.status_code == 200, response.text
    result = response.json()
    version = s.get("dataset", result["dataset"]["id"])
    row = version["rows"][0]
    assert row["human_verified"] is False and row["reviewed_at"] is None
    assert result["dataset"]["reviewed_count"] == 0
    assert result["sample"]["ai_labeled"]
    assert result["sample"]["initial_label"]["model_name"] == "GPT-Astra"
    assert row["label_source"] == "수동 레이블 · 검토 대기"
    event = row["label_history"][-1]
    assert event["channel"] == "review_cancelled"
    assert event["before"]["human_verified"] is True
    assert event["before"]["reviewed_at"] == before["reviewed_at"]
    assert event["at"] and event["parent_dataset_id"] == "d"
    for key, value in before.items():
        if key not in (
            "human_verified",
            "reviewed_at",
            "label_source",
            "label_history",
        ):
            assert row[key] == value
    assert version["rows"][1:] == d["rows"][1:]
    assert s.get("dataset", "d") == d
    count = len(s.all_of("dataset"))
    repeated = client.delete(f"/api/datasets/{version['id']}/samples/0/review")
    assert repeated.status_code == 200
    assert repeated.json()["dataset"]["id"] == version["id"]
    assert len(s.all_of("dataset")) == count
    assert client.delete("/api/datasets/d/samples/0/review").status_code == 409


def test_cancel_review_preserves_concurrent_split_change(client):
    d = reviewed(client)
    rows = copy.deepcopy(d["rows"])
    wd.set_split(rows[0], "validation", s.now())
    with s.db() as con:
        latest = wd.revision(d, rows, kind="split")
        wd.publish(latest, con)
    response = client.delete("/api/datasets/d/samples/0/review")
    assert response.status_code == 200
    assert response.json()["sample"]["split"] == "validation"
    assert response.json()["sample"]["split_history"] == rows[0]["split_history"]
    assert response.json()["dataset"]["parent_ids"] == [latest["id"]]


def test_cancel_review_rejects_concurrent_label_change_and_missing_image(client):
    d = reviewed(client)
    rows = copy.deepcopy(d["rows"])
    rows[0]["target"]["fit"] = "루즈"
    with s.db() as con:
        wd.publish(wd.revision(d, rows, kind="annotation"), con)
    count = len(s.all_of("dataset"))
    assert client.delete("/api/datasets/d/samples/0/review").status_code == 409
    latest = client.get("/api/datasets?current=true").json()[0]["id"]
    assert (
        client.delete(f"/api/datasets/{latest}/samples/missing/review").status_code
        == 404
    )
    assert len(s.all_of("dataset")) == count
