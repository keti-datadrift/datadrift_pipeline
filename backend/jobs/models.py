"""Model job inputs and subprocess execution."""

import json
import os
import sys
import time

from backend.catalog import model_path
from backend.data import store as s
from backend.jobs import execution as job_execution
from backend.jobs.results import publish_model_result
from backend.schemas import taxonomy


def run(job):
    jid, req = job["id"], job["request"]
    inference, labeling = req["kind"] == "inference", req["kind"] == "labeling"
    dataset = (
        {
            "id": jid,
            "rows": [job["input_row"]],
            "schema_id": taxonomy.CURRENT,
            "fingerprint": job["input_row"]["sha256"],
        }
        if inference
        else s.get("dataset", req["dataset_id"])
    )
    if not inference and dataset["fingerprint"] != job["dataset_fingerprint"]:
        raise ValueError("Dataset snapshot changed")
    fixed_teacher = labeling and req.get("model_id") in (None, "gemma4_teacher")
    model = {} if fixed_teacher else s.get("model", req["model_id"])
    rows = [
        r
        for r in dataset["rows"]
        if labeling
        or inference
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
        "base_model": None if fixed_teacher else str(model_path(model["family"])),
        "rows": rows,
        "output": str(folder),
        "dataset_fingerprint": dataset["fingerprint"],
        "dataset_id": dataset["id"],
        "created_at": job["created_at"],
    }
    (folder / "input.json").write_text(json.dumps(payload, ensure_ascii=False))
    env = os.environ | {
        "CUDA_VISIBLE_DEVICES": os.environ.get("DATADRIFT_GPU", "0"),
        "TOKENIZERS_PARALLELISM": "false",
    }
    started = time.monotonic()
    s.patch(
        "job",
        jid,
        progress={
            "phase": "loading",
            "step": 0,
            "total": len(rows)
            if labeling or inference
            else req["max_steps"]
            if req["kind"] == "training"
            else min(req.get("sample_limit") or len(rows), len(rows)),
            "elapsed_seconds": 0,
        },
    )
    command = [
        os.environ.get("DATADRIFT_TRAIN_PYTHON", sys.executable),
        "-m",
        "backend.relabeling" if fixed_teacher else "backend.training",
        str(folder / "input.json"),
    ]
    try:
        completed = job_execution.execute(jid, command, folder, env, started_at=started)
    except job_execution.ProcessExecutionError as exc:
        raise RuntimeError(
            f"모델 실행 프로세스 종료 코드 {exc.returncode}. 실행 로그를 확인하세요."
        ) from exc
    if not completed.cancelled:
        publish_model_result(job, dataset, model, folder, completed.started_at)
