import json
from pathlib import Path

import pytest

from backend import worker
from backend.data import store as s
from backend.jobs import execution as job_execution


def queued(client):
    reference = s.get("dataset", "d") | {
        "id": "reference",
        "fingerprint": "ref-original",
    }
    s.save("dataset", reference)
    response = client.post(
        "/api/jobs",
        json={"kind": "drift", "dataset_id": "d", "reference_id": "reference"},
    )
    assert response.status_code == 201, response.text
    return worker.claim()


def test_cpu_subprocess_publishes_composite_result_and_snapshot(client, monkeypatch):
    job = queued(client)
    assert job["reference_fingerprint"] == "ref-original"

    class Process:
        returncode = 0

        def __init__(self, command, **kwargs):
            assert command[-2] == "backend.jobs.drift"
            assert kwargs["env"]["CUDA_VISIBLE_DEVICES"] == ""
            payload = json.loads(Path(command[-1]).read_text())
            folder = Path(payload["output"])
            assert payload["reference"] == s.get("dataset", "reference")["rows"]
            (folder / "result.json").write_text(
                json.dumps(
                    {"method_version": "composite-v1", "decision": "not_detected"}
                )
            )

        def poll(self):
            return 0

    monkeypatch.setattr(job_execution.subprocess, "Popen", Process)
    worker.run(job)
    stored = s.get("job", job["id"])
    assert stored["status"] == "succeeded"
    assert stored["result"]["method_version"] == "composite-v1"
    assert stored["progress"]["phase"] == "completed"


def test_reference_snapshot_change_rejected_before_execution(client, monkeypatch):
    job = queued(client)
    s.patch("dataset", "reference", fingerprint="changed")
    monkeypatch.setattr(
        job_execution.subprocess,
        "Popen",
        lambda *a, **kw: pytest.fail("Changed snapshot"),
    )
    with pytest.raises(ValueError, match="스냅샷"):
        worker.run(job)


def test_cancel_terminates_cpu_process_and_discards_result(client, monkeypatch):
    job = queued(client)
    s.patch("job", job["id"], cancel_requested=True)
    signals = []

    class Process:
        pid = 12345678
        returncode = None

        def __init__(self, *args, **kwargs):
            pass

        def poll(self):
            return self.returncode

        def wait(self, timeout):
            self.returncode = -15

    monkeypatch.setattr(job_execution.subprocess, "Popen", Process)
    monkeypatch.setattr(
        job_execution.os, "killpg", lambda pid, sig: signals.append((pid, sig))
    )
    worker.run(job)
    stored = s.get("job", job["id"])
    assert signals and stored["status"] == "cancelled" and stored["result"] is None


def test_cancel_handles_a_child_exiting_before_the_signal(monkeypatch):
    class Process:
        pid = 12345678
        waited = False

        def wait(self, timeout):
            self.waited = True

    process = Process()

    def gone(*args):
        raise ProcessLookupError()

    monkeypatch.setattr(job_execution.os, "killpg", gone)
    job_execution.terminate(process)
    assert process.waited
