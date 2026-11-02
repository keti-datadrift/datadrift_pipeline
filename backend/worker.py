"""Persistent job queue and worker dispatch."""

import fcntl
import os
import time

from backend.data import store as s


def claim():
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        jobs = sorted(s.all_of("job", c), key=lambda j: j["created_at"])
        for j in jobs:
            if j["status"] == "queued" and not j["cancel_requested"]:
                j.update(status="running", started_at=s.now())
                s.save("job", j, c)
                return j


def run(job):
    kind = job["request"]["kind"]
    if kind == "inference" and os.environ.get("DATADRIFT_INFERENCE_BACKEND") == "vllm":
        from backend.models import inference as vllm_inference

        vllm_inference.run(job)
    elif kind == "drift":
        from backend.jobs import drift as drift_job

        drift_job.run(job)
    else:
        from backend.jobs import models as model_jobs

        model_jobs.run(job)


def main():
    s.ROOT.mkdir(parents=True, exist_ok=True)
    with (s.ROOT / "worker.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Interrupted jobs need a new submission; retain their partial artifacts.
        for j in s.all_of("job"):
            if j["status"] == "running":
                s.patch(
                    "job",
                    j["id"],
                    status="failed",
                    finished_at=s.now(),
                    error="Worker restarted; submit a new job. Previous artifacts preserved.",
                )
        while True:
            j = claim()
            if j is None:
                time.sleep(1)
                continue
            try:
                run(j)
            except Exception as exc:  # noqa: BLE001 - Persist a failed job and keep serving the queue.
                print(repr(exc), flush=True)
                s.patch(
                    "job", j["id"], status="failed", error=str(exc), finished_at=s.now()
                )


if __name__ == "__main__":
    main()
