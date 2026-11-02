import copy

from backend.data import store as s
from backend.data import workspace_data as wd
from backend.routes import workspaces as workspace_routes
from backend.schemas import taxonomy as t
from tests.test_deletions import remove
from tests.test_uploads import image_bytes, upload


def head(client):
    items = client.get("/api/datasets?current=true").json()
    return s.get("dataset", next(d["id"] for d in items if d["workspace_id"] == "w"))


def edit(client, d, row, value):
    return client.post(
        f"/api/datasets/{d['id']}/samples/{row['id']}/labels",
        json={
            "target": row["target"] | {"fit": value},
            "unscored_fields": [k for k in t.FIELDS if k != "fit"],
        },
    )


def test_upload_append_deduplicate_and_current_label_edit(client):
    first = upload(client).json()["dataset"]
    before = s.get("dataset", first["id"])
    fit = t.schema(t.CURRENT, "상의")["fit"][0]
    assert edit(client, before, before["rows"][0], fit).status_code == 201
    saved = copy.deepcopy(head(client))
    response = upload(client, [("files", ("blue.png", image_bytes("blue")))])
    assert response.status_code == 201
    active = head(client)
    assert len(active["rows"]) == 2
    assert active["rows"][0] == saved["rows"][0]
    assert len(client.get("/api/workspaces").json()[0]["datasets"]) == 1
    assert upload(client).json()["duplicate"]
    assert len(head(client)["rows"]) == 2
    assert s.get("dataset", before["id"]) == before
    # A label editor opened before a separate image upload can still save safely.
    value = next(v for v in t.schema(t.CURRENT, "상의")["fit"] if v != fit)
    assert edit(client, saved, saved["rows"][0], value).status_code == 201
    assert len(head(client)["rows"]) == 2
    assert edit(client, saved, saved["rows"][0], fit).status_code == 409


def test_label_job_merges_without_undoing_edits_uploads_or_deletions(client):
    upload(
        client,
        [
            ("files", ("a.png", image_bytes())),
            ("files", ("b.png", image_bytes("blue"))),
        ],
    )
    original = head(client)
    first, second = original["rows"]
    fit = t.schema(t.CURRENT, "상의")["fit"][0]
    assert edit(client, original, first, fit).status_code == 201
    active = head(client)
    assert remove(client, "samples", active["id"], [second["id"]]).status_code == 201
    upload(client, [("files", ("green.png", image_bytes("green")))])
    labeled = wd.revision(
        original,
        [
            r | {"target": r["target"] | {"fit": fit}, "label_state": "labeled"}
            for r in original["rows"]
        ],
        kind="ai_relabel",
        labeling_job_id="test",
        labeling_model_id="qwen35_2b",
    )
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        active, applied = wd.apply_labels(original, labeled, con)
    assert applied == 0  # One user edit, one deleted image; neither may be overwritten.
    assert len(active["rows"]) == 2
    assert second["id"] not in {r["id"] for r in active["rows"]}
    assert (
        next(r for r in active["rows"] if r["id"] == first["id"])["target"]["fit"]
        == fit
    )
    assert remove(client, "dataset", active["id"]).status_code == 201
    with s.db() as con:
        active, applied = wd.apply_labels(original, labeled, con)
    assert active is None and applied == 0
    s.initialize_read_indexes()
    assert (
        client.get("/api/datasets?current=true").json() == []
    )  # No old snapshot reappears after restart.


def test_restore_deleted_images_preserves_later_labels(client):
    upload(
        client,
        [
            ("files", ("a.png", image_bytes())),
            ("files", ("b.png", image_bytes("blue"))),
        ],
    )
    original = head(client)
    first, second = original["rows"]
    deleted = remove(client, "samples", original["id"], [first["id"]]).json()
    active = head(client)
    fit = t.schema(t.CURRENT, "상의")["fit"][0]
    assert edit(client, active, second, fit).status_code == 201
    assert (
        client.post("/api/deletions/" + deleted["id"] + "/restore").status_code == 200
    )
    active = head(client)
    assert len(active["rows"]) == 2
    assert (
        next(r for r in active["rows"] if r["id"] == second["id"])["target"]["fit"]
        == fit
    )
    assert next(r for r in active["rows"] if r["id"] == first["id"]) == first
    assert len(client.get("/api/datasets?current=true").json()) == 1


def test_legacy_import_initializes_collection_without_replacing_user_data(
    client, monkeypatch
):
    from backend import migrate_taxonomy

    dataset = s.public_dataset(s.get("dataset", "d"))
    monkeypatch.setattr(workspace_routes, "import_labeled", lambda: [dataset])
    monkeypatch.setattr(migrate_taxonomy, "migrate", lambda ids: [dataset])
    assert client.post("/api/imports/labeled").status_code == 200
    assert head(client)["id"] == "d"
    with s.db() as con:
        wd.point("w", None, con)
    assert client.post("/api/imports/labeled").status_code == 200
    assert client.get("/api/datasets?current=true").json() == []
