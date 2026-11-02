import hashlib
import json

import httpx
import pytest
from test_model_endpoints import create, submit

from backend import worker
from backend.data import store as s
from backend.jobs import execution as job_execution
from backend.models import inference as vi
from backend.schemas import taxonomy as t


def setup(client, monkeypatch, tmp_path):
    model = s.get("model", "qwen35_2b")
    adapter = tmp_path / "adapter"
    adapter.mkdir()
    (adapter / "adapter_config.json").write_text("{}")
    (adapter / "adapter_model.safetensors").write_bytes(b"selected weights")
    model.update(id="trained", kind="lora", adapter=str(adapter), schema_id=t.CURRENT)
    s.save("model", model)
    endpoint = create(client, model_id=model["id"]).json()
    monkeypatch.setenv("DATADRIFT_INFERENCE_BACKEND", "vllm")
    monkeypatch.setenv("DATADRIFT_VLLM_2B_URL", "http://vllm.test")
    monkeypatch.setenv("DATADRIFT_VLLM_READY_TIMEOUT", "0")
    return model, endpoint


def mock_transport(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(
        vi.httpx,
        "Client",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )


def test_resident_model_and_adapter_selection_without_gpu_reload(
    client, monkeypatch, tmp_path
):
    model, endpoint = setup(client, monkeypatch, tmp_path)
    loaded = {"qwen35_2b"}
    loads, calls = [], []

    def handler(request):
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": i} for i in loaded]})
        body = json.loads(request.content)
        if request.url.path == "/v1/load_lora_adapter":
            assert body == {"lora_name": model["id"], "lora_path": model["adapter"]}
            loads.append(body)
            loaded.add(model["id"])
            return httpx.Response(200, text="loaded")
        assert body["model"] == model["id"]
        assert body["chat_template_kwargs"] == {"enable_thinking": False}
        assert body["messages"][0]["content"][0]["image_url"]["url"].startswith(
            "data:image/png;base64,"
        )
        calls.append(body)
        values = {
            k: [] if k == "details" else v[0]
            for k, v in t.schema(t.CURRENT, "상의").items()
        }
        values.update(category="상의", origin="unknown", color_code="unknown")
        return httpx.Response(
            200, json={"choices": [{"message": {"content": json.dumps(values)}}]}
        )

    mock_transport(monkeypatch, handler)
    monkeypatch.setattr(
        job_execution.subprocess,
        "Popen",
        lambda *a, **kw: pytest.fail(
            "Must use resident vLLM, not reload a GPU subprocess"
        ),
    )
    before = s.all_of("dataset")
    for _ in range(2):
        queued = submit(client, endpoint).json()
        worker.run(worker.claim())
        result = client.get(queued["result_url"]).json()
        assert result["status"] == "succeeded"
        assert result["result"]["engine"] == "vllm"
        assert result["result"]["model_id"] == model["id"]
        assert result["result"]["schema_valid"] and result["result"]["parse_valid"]
        assert (
            result["result"]["teacher"]["adapter_sha256"]
            == hashlib.sha256(b"selected weights").hexdigest()
        )
    assert len(loads) == 1 and len(calls) == 2
    assert s.all_of("dataset") == before


def test_service_error_is_not_silently_sent_to_another_engine(
    client, monkeypatch, tmp_path
):
    _, endpoint = setup(client, monkeypatch, tmp_path)
    queued = submit(client, endpoint).json()
    mock_transport(monkeypatch, lambda request: httpx.Response(503, text="not ready"))
    monkeypatch.setattr(
        job_execution.subprocess,
        "Popen",
        lambda *a, **kw: pytest.fail("No silent fallback"),
    )
    with pytest.raises(RuntimeError, match="HTTP 503"):
        worker.run(worker.claim())
    assert s.get("job", queued["id"])["result"] is None


def test_cancellation_discards_completed_vllm_response(client, monkeypatch, tmp_path):
    _, endpoint = setup(client, monkeypatch, tmp_path)
    queued = submit(client, endpoint).json()

    def infer(model, row, report):
        s.patch("job", queued["id"], cancel_requested=True)
        return {"engine": "vllm"}

    monkeypatch.setattr(vi, "infer", infer)
    worker.run(worker.claim())
    result = s.get("job", queued["id"])
    assert result["status"] == "cancelled" and result["result"] is None
