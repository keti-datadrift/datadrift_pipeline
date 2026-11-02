import json
from pathlib import Path

import pytest
from test_uploads import image_bytes

from backend import worker
from backend.data import store as s
from backend.jobs import execution as job_execution
from backend.models import endpoints as me
from backend.relabeling import convert, prompt
from backend.schemas import taxonomy as t


def create(client, **overrides):
    return client.post(
        "/api/model-endpoints",
        json={"name": "상품 속성", "model_id": "qwen35_2b", **overrides},
    )


def submit(client, endpoint, content=None, **params):
    return client.post(
        endpoint["path"],
        params=params,
        files={"file": ("item.png", content or image_bytes(), "image/png")},
    )


def test_endpoint_lifecycle_and_input_contract(client, monkeypatch):
    response = create(client)
    assert response.status_code == 201
    endpoint = response.json()
    assert endpoint["available"] and endpoint["enabled"]
    assert create(client).status_code == 409
    assert create(client, name="4b", model_id="qwen35_4b").status_code == 409
    assert submit(client, endpoint, b"not-an-image").status_code == 422
    assert submit(client, endpoint, category="bad").status_code == 422
    assert (
        client.post(endpoint["path"], params={"category": "상의"}, json={}).status_code
        == 415
    )
    assert (
        client.post(
            endpoint["path"],
            params={"category": "상의"},
            files=[
                ("file", ("1.png", image_bytes())),
                ("file", ("2.png", image_bytes())),
            ],
        ).status_code
        == 422
    )
    before = s.all_of("dataset")
    response = submit(client, endpoint)
    assert response.status_code == 202
    prediction = response.json()
    assert prediction["queue_position"] == 1
    stored = s.get("job", prediction["id"])
    assert prediction["category"] is None
    assert stored["input_row"]["category"] is None
    assert stored["request"]["category"] is None
    assert "category" in prompt(stored["input_row"])
    assert Path(stored["input_row"]["image"]).read_bytes() == image_bytes()
    assert stored["request"]["model_id"] == "qwen35_2b"
    # Exercise the real output converter, which also runs on unlabeled API inputs.
    converted = convert(
        stored["input_row"],
        '{"fit": "레귤러"}',
        {"model": "test", "created_at": s.now()},
    )
    assert converted["original_label_source"] == "모델 API 입력"
    without_source = dict(stored["input_row"])
    without_source.pop("label_source")
    assert (
        convert(without_source, "{}", {"model": "test", "created_at": s.now()})[
            "original_label_source"
        ]
        == "미레이블"
    )
    assert (
        client.patch(
            "/api/model-endpoints/" + endpoint["id"], json={"enabled": False}
        ).status_code
        == 200
    )
    assert submit(client, endpoint).status_code == 409
    assert client.get(prediction["result_url"]).json()["status"] == "queued"
    assert client.post("/api/jobs/" + prediction["id"] + "/cancel").status_code == 200
    assert client.get(prediction["result_url"]).json()["status"] == "cancelled"
    assert s.all_of("dataset") == before
    assert "input_row" not in client.get("/api/jobs?summary=true").json()[0]
    explicit = submit(client, endpoint, category="아우터")
    assert explicit.status_code == 409  # The earlier stop still applies.
    client.patch("/api/model-endpoints/" + endpoint["id"], json={"enabled": True})
    explicit = submit(client, endpoint, category="아우터")
    assert explicit.status_code == 202
    assert explicit.json()["category"] == "아우터"
    parameters = (
        client.get("/api/openapi.json")
        .json()["paths"]["/api/model-endpoints/{eid}/predictions"]["post"]
        .get("parameters", [])
    )
    assert not any(p["name"] == "category" for p in parameters)
    monkeypatch.setattr(me, "MAX_IMAGE", 10)
    assert submit(client, endpoint).status_code == 413


@pytest.mark.parametrize("category", ["하의", "unknown", None])
def test_api_worker_propagates_selected_adapter_and_does_not_publish_labels(
    client, monkeypatch, tmp_path, category
):
    adapter = tmp_path / "adapter"
    adapter.mkdir()
    for f in ("adapter_config.json", "adapter_model.safetensors"):
        (adapter / f).write_text("{}")
    s.save(
        "model",
        {
            "id": "trained-test",
            "name": "trained",
            "family": "qwen35_2b",
            "kind": "lora",
            "status": "ready",
            "schema_id": t.CURRENT,
            "adapter": str(adapter),
        },
    )
    s.save(
        "model",
        s.get("model", "trained-test") | {"id": "legacy", "schema_id": t.LEGACY},
    )
    assert create(client, model_id="legacy").status_code == 422
    endpoint = create(client, model_id="trained-test").json()
    response = submit(client, endpoint).json()
    before = s.all_of("dataset")
    attributes = {
        key: [] if key == "details" else values[0]
        for key, values in t.schema(t.CURRENT, "하의").items()
    }

    class Process:
        returncode = 0

        def __init__(self, command, **kwargs):
            payload = json.loads(Path(command[-1]).read_text())
            assert payload["model"]["adapter"] == str(adapter)
            assert payload["request"]["kind"] == "inference"
            assert payload["rows"][0]["label_state"] == "unlabeled"
            assert payload["rows"][0]["category"] is None
            output = Path(payload["output"])
            raw = attributes | ({"category": category} if category is not None else {})
            row = convert(payload["rows"][0], json.dumps(raw), {"created_at": s.now()})
            (output / "progress.json").write_text(
                json.dumps({"phase": "completed", "step": 1, "total": 1})
            )
            (output / "relabeled-rows.json").write_text(json.dumps([row]))
            (output / "result.json").write_text(
                json.dumps({"teacher": {"adapter_sha256": "verified"}})
            )

        def poll(self):
            return 0

    monkeypatch.setattr(job_execution.subprocess, "Popen", Process)
    worker.run(worker.claim())
    result = client.get(response["result_url"]).json()
    assert result["status"] == "succeeded"
    valid = category == "하의"
    assert (
        result["category"]
        == result["result"]["category"]
        == ("하의" if valid else None)
    )
    assert result["result"]["category_valid"] is valid
    assert result["result"]["attributes"]["fit"] == (
        attributes["fit"] if valid else "unknown"
    )
    assert result["result"]["teacher"]["adapter_sha256"] == "verified"
    assert result["result"]["parse_valid"]
    assert result["result"]["schema_valid"] is valid
    if valid:
        assert result["result"]["attributes"]["sleeve"] == "not_applicable"
    else:
        assert set(result["result"]["excluded_attributes"]) == set(t.FIELDS)
    assert s.all_of("dataset") == before
    assert len(s.all_of("model")) == 4


def test_queue_bound_and_legacy_rejected(client):
    s.save(
        "model", s.get("model", "qwen35_2b") | {"id": "archived", "status": "archived"}
    )
    assert create(client, model_id="archived").status_code == 409
    endpoint = create(client).json()
    first = submit(client, endpoint).json()
    stored = s.get("job", first["id"])
    for i in range(31):
        s.save("job", stored | {"id": f"queued-{i}"})
    response = submit(client, endpoint)
    assert response.status_code == 429 and response.headers["Retry-After"] == "30"
    assert len(list((s.ROOT / "predictions").iterdir())) == 1


def test_prediction_history_pagination(client):
    endpoint = create(client).json()
    for index in range(25):
        s.save(
            "job",
            {
                "id": f"prediction-{index:02d}",
                "status": "succeeded",
                "created_at": s.now(),
                "request": {
                    "kind": "inference",
                    "endpoint_id": endpoint["id"],
                    "model_id": "qwen35_2b",
                    "category": "상의",
                },
            },
        )
    path = endpoint["path"]
    legacy = client.get(path).json()
    assert len(legacy) == 20
    all_ids = []
    for offset, expected in [(0, 10), (10, 10), (20, 5)]:
        response = client.get(
            path, params={"paginated": True, "offset": offset, "limit": 10}
        )
        assert response.status_code == 200
        page = response.json()
        assert page["total"] == 25
        assert len(page["items"]) == expected
        all_ids.extend(item["id"] for item in page["items"])
    assert all_ids == [f"prediction-{index:02d}" for index in reversed(range(25))]
    assert client.get(path, params={"offset": -1}).status_code == 422
    assert client.get(path, params={"limit": 101}).status_code == 422
    assert client.get(path, params={"paginated": True, "offset": 30}).json() == {
        "items": [],
        "total": 25,
    }


def test_wait_mode_returns_completed_result_in_one_request(client, monkeypatch):
    import threading
    import time

    endpoint = create(client).json()
    original = me.enqueue
    threads = []

    def enqueue(*args):
        prediction = original(*args)

        def finish():
            time.sleep(0.05)
            s.patch(
                "job",
                prediction["id"],
                status="succeeded",
                finished_at=s.now(),
                result={"attributes": {"fit": "레귤러핏"}, "engine": "vllm"},
            )

        thread = threading.Thread(target=finish)
        threads.append(thread)
        thread.start()
        return prediction

    monkeypatch.setattr(me, "enqueue", enqueue)
    response = submit(client, endpoint, wait="true")
    for thread in threads:
        thread.join(timeout=2)
    assert response.status_code == 200
    value = response.json()
    assert value["status"] == "succeeded"
    assert value["result"]["attributes"]["fit"] == "레귤러핏"
    assert "input_row" not in value
    assert client.get(value["result_url"]).json() == value


def test_wait_timeout_keeps_durable_request_and_returns_lookup_url(client, monkeypatch):
    endpoint = create(client).json()
    monkeypatch.setattr(me, "WAIT_SECONDS", 0)
    response = submit(client, endpoint, wait="true")
    assert response.status_code == 202
    value = response.json()
    assert value["status"] == "queued"
    assert client.get(value["result_url"]).json()["status"] == "queued"
    assert not s.get("job", value["id"])["cancel_requested"]
    assert submit(client, endpoint).status_code == 202
    assert submit(client, endpoint, wait="invalid").status_code == 422


@pytest.mark.parametrize("status", ["failed", "cancelled"])
def test_wait_mode_reports_terminal_outcomes_without_retry(client, monkeypatch, status):
    endpoint = create(client).json()
    original = me.enqueue

    def enqueue(*args):
        prediction = original(*args)
        s.patch(
            "job",
            prediction["id"],
            status=status,
            finished_at=s.now(),
            error="실행 종료",
        )
        return prediction

    monkeypatch.setattr(me, "enqueue", enqueue)
    response = submit(client, endpoint, wait="true")
    assert response.status_code == 200
    assert response.json()["status"] == status
    assert response.json()["error"] == "실행 종료"
    assert len(s.all_of("job")) == 1
