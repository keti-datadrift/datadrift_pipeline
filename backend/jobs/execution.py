"""Subprocess execution, progress and cancellation."""

import json
import os
import signal
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from backend.data import store as s


@dataclass(frozen=True)
class ProcessResult:
    started_at: float
    cancelled: bool = False

    @property
    def elapsed_seconds(self):
        return round(time.monotonic() - self.started_at, 2)


class ProcessExecutionError(RuntimeError):
    def __init__(self, returncode, log_path):
        self.returncode = returncode
        lines = Path(log_path).read_text()[-1000:].strip().splitlines()
        self.last_line = lines[-1] if lines else str(returncode)
        super().__init__(self.last_line)


def terminate(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def execute(job_id, command, folder, env, *, poll_interval=1, started_at=None):
    """A canceled job stays durable; only its isolated child processes are terminated."""
    started_at = time.monotonic() if started_at is None else started_at
    folder = Path(folder)
    log_path = folder / "process.log"
    process = None
    try:
        with log_path.open("w") as log:
            process = subprocess.Popen(
                command,
                stdout=log,
                stderr=subprocess.STDOUT,
                env=env,
                start_new_session=True,
            )
            while process.poll() is None:
                if s.get("job", job_id)["cancel_requested"]:
                    terminate(process)
                    s.patch("job", job_id, status="cancelled", finished_at=s.now())
                    return ProcessResult(started_at, cancelled=True)
                progress = folder / "progress.json"
                if progress.is_file():
                    try:
                        value = json.loads(progress.read_text())
                        value["elapsed_seconds"] = round(
                            time.monotonic() - started_at, 2
                        )
                        s.patch("job", job_id, progress=value)
                    except json.JSONDecodeError:
                        # Model producers may still use a non-atomic progress write.
                        pass
                time.sleep(poll_interval)
        if process.returncode:
            raise ProcessExecutionError(process.returncode, log_path)
        return ProcessResult(started_at)
    finally:
        if process is not None and process.poll() is None:
            terminate(process)
