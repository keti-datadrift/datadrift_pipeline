import copy
import hashlib
import pytest
from backend import store as s
from backend.api import reconstruct, Reconstruction
from backend.training import metrics
from backend.worker import claim


def test_task_and_pagination(client):
    assert (
        client.post("/api/workspaces", json={"name": "ocr", "task": "ocr"}).status_code
        == 422
    )
    assert client.get("/api/datasets/d/samples?limit=3").json()["total"] == 12
    assert len(client.get("/api/datasets/d/samples?limit=3").json()["items"]) == 3
    assert client.get("/api/datasets/d/samples?split=train").json()["total"] == 8
    assert "image" not in client.get("/api/datasets/d/samples").json()["items"][0]
    assert client.get("/api/datasets/missing").status_code == 404
    assert client.get("/api/datasets/d/images/unknown").status_code == 404


def test_reconstruction_preserves_heldout_and_reproducible(client):
    body = Reconstruction(
        workspace_id="w", name="mix", dataset_ids=["d"], train_budget=4
    )
    first = reconstruct(body)
    second = reconstruct(body)
    assert first["fingerprint"] == second["fingerprint"]
    assert {r["id"] for r in first["rows"] if r["split"] != "train"} == {
        "4",
        "5",
        "10",
        "11",
    }
    trains = [r for r in first["rows"] if r["split"] == "train"]
    assert len(trains) == 4
    assert sum(r["source"] == "musinsa" for r in trains) == 2
    assert (
        client.post(
            "/api/reconstructions", json=body.model_dump() | {"train_budget": 99}
        ).status_code
        == 422
    )
    conflict = copy.deepcopy(s.get("dataset", "d"))
    conflict["id"] = "conflict"
    conflict["rows"][0]["split"] = "test"
    s.save("dataset", conflict)
    assert (
        client.post(
            "/api/reconstructions",
            json=body.model_dump() | {"dataset_ids": ["d", "conflict"]},
        ).status_code
        == 422
    )


def test_job_claim_cancel_and_validation(client):
    body = {
        "kind": "training",
        "model_id": "qwen35_2b",
        "dataset_id": "d",
        "max_steps": 1,
    }
    job = client.post("/api/jobs", json=body).json()
    assert claim()["id"] == job["id"]
    assert claim() is None
    assert client.post("/api/jobs/" + job["id"] + "/cancel").json()["cancel_requested"]
    other = client.post("/api/jobs", json=body).json()
    assert (
        client.post("/api/jobs/" + other["id"] + "/cancel").json()["status"]
        == "cancelled"
    )
    assert claim() is None
    assert client.post("/api/jobs", json=body | {"max_steps": 0}).status_code == 422
    assert client.post("/api/jobs", json=body | {"split": "train"}).status_code == 422
    assert (
        client.post(
            "/api/jobs", json=body, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    client.patch(
        "/api/models/qwen35_2b", json={"name": "Archived", "status": "archived"}
    )
    assert client.post("/api/jobs", json=body).status_code == 422


def test_metric_counts_parse_failure_and_masks_unknown():
    rows = [
        {"target": {"fit": "레귤러", "details": []}, "unscored_fields": ["details"]},
        {"target": {"fit": "unknown", "pattern": "무지"}},
    ]
    result = metrics(rows, [{"fit": "레귤러"}, None])
    assert result["parse_failures"] == 1
    assert result["fields"]["fit"]["count"] == 1
    assert result["fields"]["details"]["count"] == 0
    assert result["macro_attribute_accuracy"] == 0.5


def test_rename_preserves_archived_status(client):
    client.patch("/api/models/qwen35_2b", json={"name": "old", "status": "archived"})
    renamed = client.patch("/api/models/qwen35_2b", json={"name": "new"})
    assert renamed.status_code == 200
    assert renamed.json()["status"] == "archived"


def test_missing_adapter_is_unavailable_and_rejected_before_queue(client, tmp_path):
    model = s.get("model", "qwen35_2b") | {
        "id": "trained",
        "kind": "lora",
        "adapter": str(tmp_path / "adapter"),
    }
    s.save("model", model)
    body = {"kind": "evaluation", "model_id": "trained", "dataset_id": "d"}
    assert client.get("/api/models/trained").json().get("available") is False
    assert (
        next(m for m in client.get("/api/models").json() if m["id"] == "trained")[
            "available"
        ]
        is False
    )
    assert client.post("/api/jobs", json=body).status_code == 422
    assert s.all_of("job") == []
    adapter = tmp_path / "adapter"
    adapter.mkdir()
    (adapter / "adapter_config.json").write_text("{}")
    assert client.post("/api/jobs", json=body).status_code == 422
    (adapter / "adapter_model.safetensors").write_bytes(b"fixture")
    assert client.get("/api/models/trained").json()["available"] is True
    assert client.post("/api/jobs", json=body).status_code == 201


def test_import_is_atomic_idempotent_and_retains_provenance(client, tmp_path):
    import json
    from PIL import Image
    from backend.catalog import import_labeled, FIELDS

    folder = tmp_path / "inputs/bkcave_drift/experiments"
    review = folder / "vlm_methods_review1000_20261006"
    review.mkdir(parents=True)
    gs = folder / "resnet18_gs251218_20261002"
    gs.mkdir()
    images = []
    for color in ("red", "blue"):
        path = tmp_path / (color + ".png")
        Image.new("RGB", (8, 8), color).save(path)
        images.append(
            {
                "image": str(path),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    target = {f: [] if f == "details" else "unknown" for f in FIELDS}
    manifest = [
        images[0]
        | {
            "review_id": 1,
            "product_id": "one",
            "split": "train",
            "review_status": "unreviewed",
        }
    ]
    (review / "split_manifest.json").write_text(json.dumps(manifest))
    (review / "reviews.jsonl").write_text(
        json.dumps(
            {
                "review_id": 1,
                "product_id": "one",
                "image_sha256": images[0]["sha256"],
                "status": "reviewed",
                "target": target,
                "reviewer": "AI reviewer",
                "human_verified": False,
            }
        )
        + "\n"
    )
    gsrows = [
        images[1]
        | {
            "product_id": "two",
            "split": "test",
            "target": target,
            "label_source": "pseudo label",
        }
    ]
    (gs / "gs_labeled.json").write_text(json.dumps(gsrows))
    first = import_labeled(tmp_path / "inputs")
    second = import_labeled(tmp_path / "inputs")
    assert [d["id"] for d in first] == [d["id"] for d in second]
    assert first[0]["splits"] == {"train": 1} and first[1]["splits"] == {"test": 1}
    row = s.get("dataset", first[0]["id"])["rows"][0]
    assert row["human_verified"] is False and row["label_source"] == "AI reviewer"
    count = len(s.all_of("dataset"))
    gsrows[0]["sha256"] = "invalid"
    (gs / "gs_labeled.json").write_text(json.dumps(gsrows))
    with pytest.raises(ValueError, match="integrity"):
        import_labeled(tmp_path / "inputs")
    assert len(s.all_of("dataset")) == count


def test_drift_same_distribution_is_zero():
    from backend.drift import js

    assert js({"a": 10, "b": 5}, {"a": 100, "b": 50}) == 0
    assert js({"a": 10}, {"b": 5}) == pytest.approx(1)


def test_schema_failure_is_distinct_from_json_parsing():
    from backend.training import SCHEMA, valid_schema

    valid = {
        field: [] if field == "details" else values[0]
        for field, values in SCHEMA.items()
    }
    malformed = valid | {"fit": ["레귤러"]}
    assert valid_schema(valid)
    assert not valid_schema(malformed)
    result = metrics([{"target": valid}, {"target": valid}], [valid, malformed])
    assert result["parse_failures"] == 0
    assert result["schema_failures"] == 1


def test_label_edit_creates_immutable_version_and_preserves_provenance(client):
    from backend.training import SCHEMA

    original = copy.deepcopy(s.get("dataset", "d"))
    original["rows"][0].update(label_source="AI fixture", human_verified=False)
    s.save("dataset", original)
    target = {
        key: [] if key == "details" else values[0] for key, values in SCHEMA.items()
    }
    body = {"target": target, "unscored_fields": ["fit"], "note": "QA review"}
    response = client.post("/api/datasets/d/samples/0/labels", json=body)
    assert response.status_code == 201
    version, row = response.json()["dataset"], response.json()["sample"]
    assert version["id"] != "d" and version["parent_ids"] == ["d"]
    assert version["kind"] == "annotation" and version["count"] == 12
    assert version["fingerprint"] != original["fingerprint"]
    assert row["human_verified"] is False
    assert row["original_label_source"] == "AI fixture"
    assert row["label_history"][0]["before"]["target"] == {"fit": "레귤러"}
    assert "image" not in row and "rows" not in version
    assert s.get("dataset", "d") == original
    saved = s.get("dataset", version["id"])
    assert saved["rows"][1:] == original["rows"][1:]
    assert [(r["id"], r["split"], r["sha256"]) for r in saved["rows"]] == [
        (r["id"], r["split"], r["sha256"]) for r in original["rows"]
    ]
    reviewed = client.post(
        f"/api/datasets/{version['id']}/samples/0/labels",
        json=body | {"human_verified": True},
    ).json()
    assert reviewed["sample"]["human_verified"] is True
    assert reviewed["sample"]["reviewed_at"]
    assert len(reviewed["sample"]["label_history"]) == 2
    assert s.get("dataset", version["id"])["rows"][0]["human_verified"] is False
    exported = client.get(f"/api/datasets/{reviewed['dataset']['id']}/export").text
    import json

    assert json.loads(exported.splitlines()[0])["target"] == target


def test_label_validation_and_missing_sample_do_not_save(client):
    schema = client.get("/api/label-schema?schema_id=visual-v1").json()
    target = {
        key: [] if key == "details" else values[0] for key, values in schema.items()
    }
    count = len(s.all_of("dataset"))
    for body in [
        {"target": {"fit": "레귤러"}},
        {"target": target | {"fit": "invalid"}},
        {"target": target | {"details": "후드"}},
        {"target": target, "unscored_fields": ["invalid"]},
        {"target": target, "note": "x" * 1001},
    ]:
        assert (
            client.post("/api/datasets/d/samples/0/labels", json=body).status_code
            == 422
        )
    assert (
        client.post(
            "/api/datasets/d/samples/missing/labels", json={"target": target}
        ).status_code
        == 404
    )
    assert len(s.all_of("dataset")) == count
