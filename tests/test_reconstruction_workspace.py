import copy

import pytest

from backend.data import store as s
from backend.data import workspace_data as wd


def payload(**changes):
    return dict(
        name="재구성 워크스페이스", dataset_ids=["d"], train_budget=3, **changes
    )


def test_preview_does_not_create_workspace_and_save_publishes(client):
    original = copy.deepcopy(s.get("dataset", "d"))
    before = len(s.all_of("workspace"))
    preview = client.post("/api/reconstructions/preview", json=payload())
    assert preview.status_code == 200
    assert len(s.all_of("workspace")) == before
    assert len(s.all_of("dataset")) == 1
    saved = client.post("/api/reconstructions", json=payload())
    assert saved.status_code == 201, saved.text
    d = saved.json()
    w = s.get("workspace", d["workspace_id"])
    assert w["name"] == d["name"] == "재구성 워크스페이스"
    assert w["id"] != "w"
    assert len(s.all_of("workspace")) == before + 1
    with s.db() as con:
        assert wd.current(w["id"], con)["id"] == d["id"]
    assert d["splits"] == preview.json()["splits"]
    assert d["fingerprint"] == preview.json()["fingerprint"]
    assert s.get("dataset", "d") == original


def test_failed_reconstruction_creates_nothing(client, monkeypatch):
    before = len(s.all_of("workspace"))
    body = payload()
    body["train_budget"] = 999
    assert client.post("/api/reconstructions", json=body).status_code == 422
    assert len(s.all_of("workspace")) == before
    assert len(s.all_of("dataset")) == 1

    def fail(*args):
        raise RuntimeError("publish failed")

    monkeypatch.setattr(wd, "publish", fail)
    with pytest.raises(RuntimeError):
        client.post("/api/reconstructions", json=payload())
    assert len(s.all_of("workspace")) == before
    assert len(s.all_of("dataset")) == 1


def test_existing_workspace_api_compatible_and_blank_name_rejected(client):
    response = client.post("/api/reconstructions", json=payload(workspace_id="w"))
    assert response.status_code == 201
    assert response.json()["workspace_id"] == "w"
    assert len(s.all_of("workspace")) == 1
    body = payload()
    body["name"] = "   "
    assert client.post("/api/reconstructions", json=body).status_code == 422
