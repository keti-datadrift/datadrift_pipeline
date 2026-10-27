"""One persistent worker; durable queue, cancellation, restart recovery, serialized GPU jobs."""

import fcntl
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from . import store as s
from . import taxonomy
from .catalog import model_path
from .drift import detect


def claim():
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        jobs = sorted(s.all_of("job", c), key=lambda j: j["created_at"])
        for j in jobs:
            if j["status"] == "queued" and not j["cancel_requested"]:
                j.update(status="running", started_at=s.now())
                s.save("job", j, c)
                return j


def run(j):
    jid = j["id"]
    req = j["request"]
    dataset = s.get("dataset", req["dataset_id"])
    if dataset["fingerprint"] != j["dataset_fingerprint"]:
        raise ValueError("Dataset snapshot changed")
    if req["kind"] == "drift":
        result = detect(
            s.get("dataset", req["reference_id"])["rows"],
            dataset["rows"],
            req["threshold"],
        )
        if s.get("job", jid)["cancel_requested"]:
            s.patch("job", jid, status="cancelled", finished_at=s.now())
        else:
            s.patch("job", jid, status="succeeded", result=result, finished_at=s.now())
        return
    labeling = req["kind"] == "labeling"
    model = {} if labeling else s.get("model", req["model_id"])
    rows = [
        r
        for r in dataset["rows"]
        if labeling
        or r["split"] == ("train" if req["kind"] == "training" else req["split"])
    ]
    folder = s.ROOT / "jobs" / jid
    folder.mkdir(parents=True, exist_ok=True)
    prompt = model.get("prompt")
    if not prompt and model.get("training_job_id"):
        prompt = (s.get("job", model["training_job_id"]).get("result") or {}).get(
            "prompt"
        )
    payload = {
        "prompt": prompt,
        "schema_id": dataset.get("schema_id", taxonomy.LEGACY),
        "request": req,
        "model": model,
        "base_model": None if labeling else str(model_path(model["family"])),
        "rows": rows,
        "output": str(folder),
        "dataset_fingerprint": dataset["fingerprint"],
        "dataset_id": dataset["id"],
        "created_at": j["created_at"],
    }
    (folder / "input.json").write_text(json.dumps(payload, ensure_ascii=False))
    python = os.environ.get("DATADRIFT_TRAIN_PYTHON", sys.executable)
    env = os.environ.copy()
    env.update(
        CUDA_VISIBLE_DEVICES=os.environ.get("DATADRIFT_GPU", "0"),
        TOKENIZERS_PARALLELISM="false",
    )
    process = None
    try:
        with (folder / "process.log").open("w") as log:
            process = subprocess.Popen(
                [
                    python,
                    "-m",
                    "backend.relabeling" if labeling else "backend.training",
                    str(folder / "input.json"),
                ],
                stdout=log,
                stderr=subprocess.STDOUT,
                env=env,
                start_new_session=True,
            )
            while process.poll() is None:
                if s.get("job", jid)["cancel_requested"]:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                    s.patch("job", jid, status="cancelled", finished_at=s.now())
                    return
                progress = folder / "progress.json"
                if progress.exists():
                    try:
                        s.patch("job", jid, progress=json.loads(progress.read_text()))
                    except json.JSONDecodeError:
                        pass
                time.sleep(1)
        if process.returncode:
            raise RuntimeError(
                f"학습 프로세스 종료 코드 {process.returncode}. 실행 로그를 확인하세요."
            )
        result = json.loads((folder / "result.json").read_text())
        with s.db() as c:
            c.execute("BEGIN IMMEDIATE")
            latest = s.get("job", jid, c)
            if latest["cancel_requested"]:
                latest.update(status="cancelled", finished_at=s.now())
            else:
                if labeling:
                    rows = json.loads((folder / "relabeled-rows.json").read_text())
                    if len(rows) != len(dataset["rows"]):
                        raise ValueError("Incomplete relabeling result")
                    did = "relabeled-" + jid
                    labeled = {
                        **dataset,
                        "id": did,
                        "name": dataset["name"] + " · AI 재레이블",
                        "kind": "ai_relabel",
                        "rows": rows,
                        "created_at": s.now(),
                        "parent_ids": [dataset["id"]],
                        "labeling_job_id": jid,
                        "provenance": "Gemma-4-12B 이미지 재판독 · 사람 검토 전",
                        "fingerprint": hashlib.sha256(
                            json.dumps(
                                rows, sort_keys=True, ensure_ascii=False
                            ).encode()
                        ).hexdigest(),
                        "label_coverage": result["label_coverage"],
                        "teacher": result["teacher"],
                    }
                    labeled.pop("annotation_base_name", None)
                    s.save("dataset", labeled, c)
                    result["dataset_id"] = did
                if req["kind"] == "training":
                    mid = "trained-" + jid
                    s.save(
                        "model",
                        {
                            "id": mid,
                            "name": model["name"] + " · " + jid[:6],
                            "family": model["family"],
                            "kind": "lora",
                            "status": "ready",
                            "adapter": str(folder / "adapter"),
                            "created_at": s.now(),
                            "training_job_id": jid,
                            "dataset_id": dataset["id"],
                            "parent_id": model["id"],
                            "schema_id": result.get("schema_id", taxonomy.LEGACY),
                            "taxonomy_snapshot": result.get("taxonomy_snapshot"),
                            "prompt": result["prompt"],
                            "prompt_sha256": result["prompt_sha256"],
                        },
                        c,
                    )
                    result["model_id"] = mid
                latest.update(
                    status="succeeded",
                    finished_at=s.now(),
                    result=result,
                    progress=json.loads((folder / "progress.json").read_text()),
                )
            s.save("job", latest, c)
    finally:
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()


def main():
    s.ROOT.mkdir(parents=True, exist_ok=True)
    with (s.ROOT / "worker.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # A terminated process is never reported as a successful or resumable training run.
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
            except Exception as exc:
                print(repr(exc), flush=True)
                s.patch(
                    "job", j["id"], status="failed", error=str(exc), finished_at=s.now()
                )


if __name__ == "__main__":
    main()
