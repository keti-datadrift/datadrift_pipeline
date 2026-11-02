import copy
import json
from pathlib import Path

from backend.data import store as s


def test_backfill_keeps_original_data_and_order(tmp_path, monkeypatch):
    monkeypatch.setattr(s, "ROOT", tmp_path)
    for identifier in ["first", "second"]:
        s.save(
            "dataset",
            {
                "id": identifier,
                "workspace_id": "w",
                "name": identifier,
                "rows": [{"id": "one", "image": "/tmp/one", "split": "train"}],
            },
        )
    with s.db() as c:
        originals = list(c.execute("SELECT body FROM objects ORDER BY rowid"))
    s.initialize_read_indexes()
    s.initialize_read_indexes()
    assert [d["id"] for d in s.dataset_summaries()] == ["second", "first"]
    assert s.dataset_summaries()[0]["splits"] == {"train": 1}
    assert s.image_path("first", "one") == "/tmp/one"
    with s.db() as c:
        assert [r[0] for r in originals] == [
            r[0] for r in c.execute("SELECT body FROM objects ORDER BY rowid")
        ]


def test_indexes_follow_external_write_rollback_and_delete(client):
    original = s.get("dataset", "d")
    changed = copy.deepcopy(original)
    changed["name"] = "changed by another connection"
    changed["rows"] = changed["rows"][:2]
    changed["rows"][0]["image"] = "/tmp/new-image"
    # Models a worker/direct SQL writer that knows nothing about the read indexes.
    with s.db() as c:
        c.execute(
            "UPDATE objects SET body=? WHERE kind='dataset' AND id='d'",
            (json.dumps(changed),),
        )
    assert client.get("/api/datasets/d").json() == s.public_dataset(changed)
    assert s.image_path("d", "0") == "/tmp/new-image"
    try:
        with s.db() as c:
            s.save("dataset", original, c)
            raise RuntimeError("abort")
    except RuntimeError:
        pass
    assert s.dataset_summaries(dataset_id="d")[0]["count"] == 2
    with s.db() as c:
        c.execute("DELETE FROM objects WHERE kind='dataset' AND id='d'")
    assert client.get("/api/datasets/d").status_code == 404
    assert client.get("/api/datasets/d/images/0").status_code == 404


def test_list_projection_matches_full_and_avoids_loading_rows(client, monkeypatch):
    dataset = s.get("dataset", "d")
    expected = s.public_dataset(dataset)
    Path(dataset["rows"][0]["image"]).write_bytes(b"image fixture")
    from backend.data import workspace_data as wd

    with s.db() as con:
        wd.point("w", "d", con)
    original_get, original_all = s.get, s.all_of

    def get(kind, *a, **kw):
        assert kind != "dataset", "list/image must not deserialize the dataset"
        return original_get(kind, *a, **kw)

    def all_of(kind, *a, **kw):
        assert kind != "dataset"
        return original_all(kind, *a, **kw)

    monkeypatch.setattr(s, "get", get)
    monkeypatch.setattr(s, "all_of", all_of)
    assert client.get("/api/datasets").json() == [expected]
    assert client.get("/api/datasets?workspace_id=missing").json() == []
    assert client.get("/api/workspaces").json()[0]["datasets"] == [expected]
    image = client.get("/api/datasets/d/images/0")
    assert image.status_code == 200 and image.content == b"image fixture"
    assert image.headers["cache-control"] == "private, max-age=3600"
    assert client.get("/api/datasets/d/images/absent").status_code == 404


def test_summary_lists_keep_detail_endpoints_compatible(client):
    s.save(
        "job",
        {
            "id": "j",
            "request": {"kind": "evaluation"},
            "status": "succeeded",
            "progress": {"step": 2, "history": [{"loss": 0.1}]},
            "result": {"predictions": [{"raw": "full output"}]},
        },
    )
    full = client.get("/api/jobs").json()[0]
    summary = client.get("/api/jobs?summary=true").json()[0]
    assert "result" not in summary and "history" not in summary["progress"]
    assert summary["progress"]["step"] == 2
    assert client.get("/api/jobs/j").json() == full
    assert client.get("/api/jobs?summary=true&kind=training").json() == []
    m = s.get("model", "qwen35_2b")
    m.update(prompt="large prompt", schema_snapshot={"large": "schema"})
    s.save("model", m)
    small = next(
        m
        for m in client.get("/api/models?summary=true").json()
        if m["id"] == "qwen35_2b"
    )
    assert "prompt" not in small and "schema_snapshot" not in small
    assert small["available"] is True
    assert client.get("/api/models/qwen35_2b").json()["prompt"] == "large prompt"
