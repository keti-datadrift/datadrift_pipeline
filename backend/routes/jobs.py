"""Jobs HTTP endpoints."""

import asyncio
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.catalog import model_available
from backend.data import store as s
from backend.schemas import taxonomy
from backend.schemas.contracts import Job
from backend.schemas.validation import (
    require_labels,
    selected_labeling_model,
    workspace_labeling_model,
)

router = APIRouter()


@router.post("/api/jobs", status_code=201)
def create_job(body: Job):
    d = s.get("dataset", body.dataset_id)
    if body.kind == "labeling":
        if body.model_id is None:
            body = body.model_copy(
                update={
                    "model_id": workspace_labeling_model(
                        s.get("workspace", d["workspace_id"]), d
                    )
                }
            )
        schema_id = d.get("schema_id", taxonomy.LEGACY)
        taxonomy.schema(schema_id)
        if not d["rows"]:
            raise ValueError("이미지를 먼저 업로드하세요.")
        if body.reference_id:
            raise ValueError("자동 레이블링에는 비교 데이터셋이 필요하지 않습니다.")
        selected_labeling_model(body.model_id, schema_id)
    elif body.kind == "drift":
        if not body.reference_id or body.reference_id == body.dataset_id:
            raise ValueError("서로 다른 비교 데이터셋을 선택하세요.")
        ref = s.get("dataset", body.reference_id)
        if ref.get("schema_id", taxonomy.LEGACY) != d.get("schema_id", taxonomy.LEGACY):
            raise ValueError("같은 레이블 기준의 데이터셋끼리 비교하세요.")
        if not d["rows"] or not ref["rows"]:
            raise ValueError("Empty comparison dataset")
    else:
        require_labels(d)
        if not body.model_id:
            raise ValueError("모델을 선택하세요.")
        m = s.get("model", body.model_id)
        if m["kind"] == "lora" and m.get("schema_id", taxonomy.LEGACY) != d.get(
            "schema_id", taxonomy.LEGACY
        ):
            raise ValueError(
                "모델과 데이터셋의 레이블 기준이 다릅니다. 동일 기준 모델 또는 기본 모델을 선택하세요."
            )
        if m["status"] != "ready":
            raise ValueError("보관된 모델은 사용할 수 없습니다.")
        if not model_available(m):
            raise ValueError("기본 모델 또는 LoRA 어댑터 파일이 서버에 없습니다.")
        partition = "train" if body.kind == "training" else body.split
        if not any(r["split"] == partition for r in d["rows"]):
            raise ValueError("Selected split is empty")
    job = {
        "id": s.uid(),
        "created_at": s.now(),
        "status": "queued",
        "progress": {},
        "request": body.model_dump(),
        "dataset_fingerprint": d["fingerprint"],
        "cancel_requested": False,
        "result": None,
        "error": None,
    }
    if body.kind == "drift":
        job["reference_fingerprint"] = ref["fingerprint"]
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        # Recheck under the deletion/queue lock so deleted inputs cannot be queued.
        s.get("dataset", body.dataset_id, con)
        if body.reference_id:
            s.get("dataset", body.reference_id, con)
        if body.kind == "labeling" and any(
            j["request"]["kind"] == "labeling"
            and j["request"]["dataset_id"] == body.dataset_id
            and j["status"] in ("queued", "running")
            for j in s.all_of("job", con)
        ):
            raise HTTPException(
                409, "이 데이터셋의 자동 레이블링이 이미 진행 중입니다."
            )
        return s.save("job", job, con)


def named_jobs(values):
    datasets = {d["id"]: d for d in s.dataset_summaries()}
    workspaces = {w["id"]: w["name"] for w in s.all_of("workspace")}
    for j in values:
        for prefix, key in (("dataset", "dataset_id"), ("reference", "reference_id")):
            d = datasets.get(j["request"].get(key))
            if d:
                j[prefix + "_name"] = workspaces.get(d["workspace_id"], d["name"])
                j[prefix + "_workspace_id"] = d["workspace_id"]
        j.pop("input_row", None)
    return values


@router.get("/api/jobs")
def jobs(
    kind: Literal["training", "evaluation", "drift", "labeling", "inference"]
    | None = None,
    summary: bool = False,
):
    if summary:
        return named_jobs(s.job_summaries(kind))
    return named_jobs(
        [j for j in s.all_of("job") if kind is None or j["request"]["kind"] == kind]
    )


@router.get("/api/jobs/{jid}")
def job(jid: str):
    return named_jobs([s.get("job", jid)])[0]


@router.post("/api/jobs/{jid}/cancel")
def cancel(jid: str):
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        j = s.get("job", jid, c)
        if j["status"] not in ("queued", "running"):
            raise HTTPException(409, "종료된 작업입니다.")
        j["cancel_requested"] = True
        if j["status"] == "queued":
            j.update(status="cancelled", finished_at=s.now())
        return s.save("job", j, c)


@router.get("/api/jobs/{jid}/logs")
def logs(jid: str):
    s.get("job", jid)
    file = s.ROOT / "jobs" / jid / "process.log"
    return {"text": file.read_text(errors="replace")[-60000:] if file.exists() else ""}


@router.get("/api/jobs/{jid}/events")
async def events(jid: str, request: Request):
    s.get("job", jid)

    async def stream():
        while not await request.is_disconnected():
            j = s.get("job", jid)
            yield "data: " + json.dumps(j, ensure_ascii=False) + "\n\n"
            if j["status"] not in ("queued", "running"):
                break
            await asyncio.sleep(2)

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )
