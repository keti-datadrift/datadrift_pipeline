import time

import pytest
from test_model_endpoints import create, submit

from backend import vllm_runtime as vr
from backend.data import store as s
from backend.models import inference as vi


@pytest.fixture
def engines(client, monkeypatch):
    monkeypatch.setenv("DATADRIFT_VLLM_MANAGED", "1")
    states = dict.fromkeys(vr.UNITS, "inactive")
    health = dict.fromkeys(vr.UNITS, False)
    calls = []
    monkeypatch.setattr(
        vr,
        "systemd_status",
        lambda f: {
            "LoadState": "loaded",
            "ActiveState": states[f],
            "Result": "success",
        },
    )
    monkeypatch.setattr(vr, "healthy", lambda f: health[f])

    def control(family, action):
        calls.append((family, action))
        states[family] = "active" if action == "start" else "deactivating"
        if action == "stop":
            health[family] = False

    monkeypatch.setattr(vr, "control", control)
    return states, health, calls


def state(endpoint, client):
    return next(
        e
        for e in client.get("/api/model-endpoints").json()
        if e["id"] == endpoint["id"]
    )["runtime"]


def toggle(client, endpoint, enabled):
    return client.patch(
        "/api/model-endpoints/" + endpoint["id"], json={"enabled": enabled}
    ).json()


def test_stop_frees_last_server_and_start_waits_for_new_ready_process(client, engines):
    states, health, calls = engines
    endpoint = create(client).json()
    vr.reconcile()
    assert calls == [("qwen35_2b", "start")]
    assert state(endpoint, client)["state"] == "starting"
    assert not vr.is_ready("qwen35_2b")
    health["qwen35_2b"] = True
    vr.reconcile()
    assert vr.is_ready("qwen35_2b")
    toggle(client, endpoint, False)
    vr.reconcile()
    assert calls[-1] == ("qwen35_2b", "stop")
    assert state(endpoint, client)["state"] == "stopping"
    # Immediate re-enable must not use the departing, still-listening server.
    toggle(client, endpoint, True)
    health["qwen35_2b"] = True
    vr.reconcile()
    assert not vr.is_ready("qwen35_2b")
    assert calls[-1][1] == "stop"
    assert state(endpoint, client)["state"] == "waiting"
    states["qwen35_2b"] = "inactive"
    s.patch("model_runtime", "qwen35_2b", last_start_attempt=0)
    vr.reconcile()
    assert calls[-1] == ("qwen35_2b", "start")
    health["qwen35_2b"] = False
    vr.reconcile()
    assert not vr.is_ready("qwen35_2b")
    health["qwen35_2b"] = True
    vr.reconcile()
    assert state(endpoint, client)["state"] == "ready"


@pytest.mark.parametrize("status", ["queued", "running"])
def test_stop_drains_accepted_requests_before_shutdown(client, engines, status):
    states, health, calls = engines
    endpoint = create(client).json()
    queued = submit(client, endpoint).json()
    s.patch("job", queued["id"], status=status)
    states["qwen35_2b"], health["qwen35_2b"] = "active", True
    toggle(client, endpoint, False)
    vr.reconcile()
    assert not calls
    assert state(endpoint, client)["state"] == "draining"
    assert state(endpoint, client)["active_requests"] == 1
    assert submit(client, endpoint).status_code == 409
    s.patch("job", queued["id"], status="succeeded")
    vr.reconcile()
    assert calls == [("qwen35_2b", "stop")]
    states["qwen35_2b"] = "inactive"
    vr.reconcile()
    assert state(endpoint, client)["state"] == "stopped"
    # Controller restart/ticks must respect the persisted disabled reception.
    vr.reconcile()
    assert len(calls) == 1


def test_shared_base_model_server_stays_up_until_last_endpoint_stops(client, engines):
    states, health, calls = engines
    one = create(client).json()
    two = create(client, name="second").json()
    states["qwen35_2b"], health["qwen35_2b"] = "active", True
    toggle(client, one, False)
    vr.reconcile()
    assert not calls
    assert state(one, client)["shared"]
    assert state(one, client)["state"] == "ready"
    toggle(client, two, False)
    vr.reconcile()
    assert calls == [("qwen35_2b", "stop")]


def test_startup_serialization_and_busy_family_priority(client, engines, monkeypatch):
    states, health, calls = engines
    monkeypatch.setattr(vr, "model_available", lambda model: True)
    two = create(client).json()
    s.save("model", s.get("model", "qwen35_2b") | {"id": "four", "family": "qwen35_4b"})
    s.save(
        "model_endpoint",
        s.get("model_endpoint", two["id"]) | {"id": "four-api", "model_id": "four"},
    )
    s.save(
        "job",
        {
            "id": "busy",
            "status": "queued",
            "request": {"kind": "inference", "model_id": "four"},
        },
    )
    vr.reconcile()
    assert calls == [("qwen35_4b", "start")]
    assert state(two, client)["state"] == "waiting"
    vr.reconcile()
    assert len(calls) == 1
    # Do not release the other engine's memory during a startup profile either.
    toggle(client, two, False)
    states["qwen35_2b"], health["qwen35_2b"] = "active", True
    vr.reconcile()
    assert len(calls) == 1
    health["qwen35_4b"] = True
    vr.reconcile()
    assert calls[-1] == ("qwen35_2b", "stop")


def test_control_failure_visible_with_backoff_and_recovery(
    client, engines, monkeypatch
):
    states, health, calls = engines
    endpoint = create(client).json()

    def fail(family, action):
        calls.append((family, action))
        raise RuntimeError("systemd 접근 실패")

    monkeypatch.setattr(vr, "control", fail)
    vr.reconcile()
    assert state(endpoint, client)["state"] == "error"
    assert "접근 실패" in state(endpoint, client)["error"]
    vr.reconcile()
    assert len(calls) == 1
    assert state(endpoint, client)["state"] == "error"
    states["qwen35_2b"], health["qwen35_2b"] = "active", True
    vr.reconcile()
    assert state(endpoint, client)["state"] == "ready"
    assert state(endpoint, client)["error"] is None


def test_stale_manager_status_does_not_authorize_inference(client, engines):
    states, health, _calls = engines
    endpoint = create(client).json()
    states["qwen35_2b"], health["qwen35_2b"] = "active", True
    vr.reconcile()
    s.patch("model_runtime", "qwen35_2b", checked_at=time.time() - 60)
    assert not vr.is_ready("qwen35_2b")
    assert state(endpoint, client)["state"] == "unknown"


def test_inference_gate_rejects_departing_http_server(monkeypatch):
    monkeypatch.setenv("DATADRIFT_VLLM_READY_TIMEOUT", "0")

    class Client:
        def get(self, *args, **kwargs):
            pytest.fail("Must not query a departing server")

    with pytest.raises(RuntimeError, match="시작을 기다리고"):
        vi.ready_models(Client(), lambda: None, lambda: False)


def test_engine_auto_restart_failure_is_exposed(client, engines, monkeypatch):
    endpoint = create(client).json()
    monkeypatch.setattr(
        vr,
        "systemd_status",
        lambda f: {
            "LoadState": "loaded",
            "ActiveState": "activating",
            "SubState": "auto-restart",
            "Result": "exit-code",
        },
    )
    vr.reconcile()
    runtime = state(endpoint, client)
    assert runtime["state"] == "error"
    assert "exit-code" in runtime["error"]


def test_status_api_distinguishes_accepting_from_server_readiness(client, engines):
    states, health, _calls = engines
    endpoint = create(client).json()
    path = endpoint["status_url"]
    vr.reconcile()
    response = client.get(path)
    assert response.headers["cache-control"] == "no-store"
    status = response.json()
    assert status["endpoint_id"] == endpoint["id"]
    assert status["accepting_requests"] and not status["ready"]
    assert status["runtime"]["state"] == "starting"
    states["qwen35_2b"], health["qwen35_2b"] = "active", True
    vr.reconcile()
    assert client.get(path).json()["ready"]
    # A different endpoint can hold the server up without opening this API.
    create(client, name="shared")
    toggle(client, endpoint, False)
    vr.reconcile()
    status = client.get(path).json()
    assert not status["accepting_requests"] and not status["ready"]
    assert status["runtime"]["state"] == "ready" and status["runtime"]["shared"]
    assert client.get("/api/model-endpoints/missing/status").status_code == 404
