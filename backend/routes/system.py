"""System HTTP endpoints."""

import json

from fastapi import APIRouter

from backend.data import store as s

router = APIRouter()


@router.get("/api/health")
def health():
    with s.db() as c:
        c.execute("SELECT 1")
    return {"status": "ok", "task": "attribute_extraction"}


@router.get("/api/experiments/relabel-drift")
def relabel_experiment():
    path = s.ROOT / "relabel-drift-experiment.json"
    if not path.exists():
        return {"status": "not_started"}
    report = json.loads(path.read_text())
    # The coordinator may await a queued training job while an earlier evaluation runs.
    if report["status"] not in {"succeeded", "failed"}:
        for key, jid in report.get("jobs", {}).items():
            try:
                job = s.get("job", jid)
            except KeyError:
                continue
            if job["status"] == "running":
                report["active_job"] = {
                    "key": key,
                    "id": jid,
                    "status": job["status"],
                    "progress": job["progress"],
                }
                break
    return report
