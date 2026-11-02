"""Drift analysis subprocess and job result handling."""

import json
import os
import sys
from pathlib import Path

from backend.data import store as s
from backend.jobs import execution as job_execution


def run(job):
    jid, req = job["id"], job["request"]
    reference = s.get("dataset", req["reference_id"])
    current = s.get("dataset", req["dataset_id"])
    if (
        reference["fingerprint"]
        != job.get("reference_fingerprint", reference["fingerprint"])
        or current["fingerprint"] != job["dataset_fingerprint"]
    ):
        raise ValueError("비교 데이터 스냅샷이 변경되었습니다.")
    folder = s.ROOT / "jobs" / jid
    folder.mkdir(parents=True, exist_ok=True)
    payload = {
        "reference": reference["rows"],
        "current": current["rows"],
        "threshold": req["threshold"],
        "seed": req.get("seed", 42),
        "cache": str(s.ROOT / "image-features"),
        "output": str(folder),
    }
    source = folder / "drift-input.json"
    source.write_text(json.dumps(payload, ensure_ascii=False))
    env = os.environ | {
        "CUDA_VISIBLE_DEVICES": "",
        "OMP_NUM_THREADS": "8",
        "OPENBLAS_NUM_THREADS": "1",
    }
    python = os.environ.get("DATADRIFT_TRAIN_PYTHON", sys.executable)
    command = [python, "-m", "backend.jobs.drift", str(source)]
    try:
        completed = job_execution.execute(jid, command, folder, env, poll_interval=0.5)
    except job_execution.ProcessExecutionError as exc:
        raise RuntimeError("드리프트 분석 실패: " + exc.last_line) from exc
    if completed.cancelled:
        return
    result = json.loads((folder / "result.json").read_text())
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        latest = s.get("job", jid, con)
        if latest["cancel_requested"]:
            latest.update(status="cancelled", finished_at=s.now())
        else:
            latest.update(
                status="succeeded",
                result=result,
                finished_at=s.now(),
                progress={
                    "phase": "completed",
                    "step": 1,
                    "total": 1,
                    "elapsed_seconds": completed.elapsed_seconds,
                },
            )
        s.save("job", latest, con)


def main(source):
    from backend.drift.detection import detect

    payload = json.loads(Path(source).read_text())
    folder = Path(payload["output"])

    def report(phase, step, total):
        temporary = folder / "progress.tmp"
        temporary.write_text(json.dumps({"phase": phase, "step": step, "total": total}))
        temporary.replace(folder / "progress.json")

    result = detect(
        payload["reference"],
        payload["current"],
        payload["threshold"],
        seed=payload["seed"],
        report=report,
        cache=payload["cache"],
    )
    temporary = folder / "result.tmp"
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False))
    temporary.replace(folder / "result.json")


if __name__ == "__main__":
    main(sys.argv[1])
