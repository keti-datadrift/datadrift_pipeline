"""Image prediction endpoints and request history."""

import asyncio
import hashlib
import io
import json
import shutil
import warnings

from fastapi import APIRouter, HTTPException, Query, Request, Response
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from backend import vllm_runtime
from backend.catalog import model_available
from backend.data import store as s
from backend.data.uploads import FORMATS, MAX_IMAGE, MAX_PIXELS, empty_target
from backend.schemas import taxonomy as t

router = APIRouter(prefix="/api")
WAIT_SECONDS = 120


class CreateEndpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    model_id: str


class EndpointState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


def eligible(model_id, con=None):
    model = s.get("model", model_id, con)
    if model["status"] != "ready" or not model_available(model):
        raise HTTPException(409, "모델이 보관되었거나 모델 파일을 사용할 수 없습니다.")
    if model["kind"] != "base" and model.get("schema_id") != t.CURRENT:
        raise HTTPException(422, "현재 속성으로 학습한 모델을 선택하세요.")
    return model


def public_endpoint(endpoint, targets=None, records=None):
    try:
        model = eligible(endpoint["model_id"])
        available, reason = True, None
    except (HTTPException, KeyError) as exc:
        model = None
        available, reason = False, getattr(exc, "detail", "모델이 없습니다.")
    return endpoint | {
        "available": available,
        "unavailable_reason": reason,
        "model_name": model["name"] if model else endpoint.get("model_name"),
        "path": f"/api/model-endpoints/{endpoint['id']}/predictions",
        "status_url": f"/api/model-endpoints/{endpoint['id']}/status",
        "response_mode": "async",
        "runtime": vllm_runtime.endpoint_runtime(endpoint, model, targets, records),
    }


@router.get("/model-endpoints")
def endpoints():
    with s.db() as con:
        con.execute("BEGIN")
        items = s.all_of("model_endpoint", con)
        targets = vllm_runtime.demand(con) if vllm_runtime.managed() else None
        records = vllm_runtime.runtime_records(con) if targets is not None else None
    return [public_endpoint(e, targets, records) for e in items]


@router.get("/model-endpoints/{eid}/status")
def endpoint_status(eid: str, response: Response):
    endpoint = public_endpoint(s.get("model_endpoint", eid))
    accepting = endpoint["enabled"] and endpoint["available"]
    runtime = endpoint["runtime"]
    response.headers["Cache-Control"] = "no-store"
    return {
        "endpoint_id": eid,
        "name": endpoint["name"],
        "model_id": endpoint["model_id"],
        "accepting_requests": accepting,
        "ready": accepting and (runtime is None or runtime["state"] == "ready"),
        "unavailable_reason": endpoint["unavailable_reason"],
        "runtime": runtime,
    }


@router.post("/model-endpoints", status_code=201)
def create_endpoint(body: CreateEndpoint):
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        model = eligible(body.model_id, con)
        if any(e["name"] == body.name for e in s.all_of("model_endpoint", con)):
            raise HTTPException(409, "같은 이름의 API가 있습니다.")
        endpoint = s.save(
            "model_endpoint",
            {
                "id": s.uid(),
                "name": body.name,
                "model_id": model["id"],
                "model_name": model["name"],
                "schema_id": t.CURRENT,
                "enabled": True,
                "created_at": s.now(),
            },
            con,
        )
    return public_endpoint(endpoint)


@router.patch("/model-endpoints/{eid}")
def update_endpoint(eid: str, body: EndpointState):
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        endpoint = s.get("model_endpoint", eid, con)
        if body.enabled:
            eligible(endpoint["model_id"], con)
        endpoint["enabled"] = body.enabled
        s.save("model_endpoint", endpoint, con)
    return public_endpoint(endpoint)


def queue_positions():
    with s.db() as con:
        rows = con.execute(
            "SELECT id FROM objects WHERE kind='job' AND json_extract(body, '$.status') IN ('queued','running') ORDER BY json_extract(body, '$.created_at'), rowid"
        )
        return {row["id"]: i + 1 for i, row in enumerate(rows)}


def public_prediction(job, positions=None):
    req = job["request"]
    if req["kind"] != "inference":
        raise KeyError("API 추론 요청이 아닙니다.")
    position = (queue_positions() if positions is None else positions).get(job["id"])
    return {
        k: job.get(k)
        for k in (
            "id",
            "status",
            "created_at",
            "started_at",
            "finished_at",
            "progress",
            "result",
            "error",
        )
    } | {
        "endpoint_id": req["endpoint_id"],
        "model_id": req["model_id"],
        "category": (job.get("result") or {}).get("category", req.get("category")),
        "queue_position": position,
        "result_url": f"/api/predictions/{job['id']}",
    }


@router.get("/predictions/{pid}")
def prediction(pid: str):
    return public_prediction(s.get("job", pid))


@router.get("/model-endpoints/{eid}/predictions")
def predictions(
    eid: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    paginated: bool = False,
):
    s.get("model_endpoint", eid)
    with s.db() as con:
        con.execute("BEGIN")
        jobs = [
            json.loads(row[0])
            for row in con.execute(
                "SELECT json_remove(body, '$.input_row') FROM objects WHERE kind='job' AND json_extract(body, '$.request.endpoint_id')=? ORDER BY rowid DESC LIMIT ? OFFSET ?",
                (eid, limit, offset),
            )
        ]
        total = con.execute(
            "SELECT count(*) FROM objects WHERE kind='job' AND json_extract(body, '$.request.endpoint_id')=?",
            (eid,),
        ).fetchone()[0]
    positions = queue_positions()
    items = [public_prediction(j, positions) for j in jobs]
    return {"items": items, "total": total} if paginated else items


def enqueue(eid, category, content):
    if category is not None and category not in t.CATEGORIES:
        raise ValueError("상품 카테고리를 확인하세요.")
    if not content or len(content) > MAX_IMAGE:
        raise HTTPException(413, "이미지는 20MB 이내로 보내세요.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                suffix = FORMATS.get(image.format)
                if (
                    not suffix
                    or image.width * image.height > MAX_PIXELS
                    or getattr(image, "n_frames", 1) != 1
                ):
                    raise ValueError("Unsupported image")
                image.verify()
            with Image.open(io.BytesIO(content)) as image:
                image.load()
    except (
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
    ) as exc:
        raise ValueError(
            "JPEG, PNG, WebP 단일 이미지를 보내세요. 최대 2,500만 화소까지 지원합니다."
        ) from exc
    jid = s.uid()
    folder = s.ROOT / "predictions" / jid
    created = False
    try:
        with s.db() as con:
            con.execute("BEGIN IMMEDIATE")
            endpoint = s.get("model_endpoint", eid, con)
            if not endpoint["enabled"]:
                raise HTTPException(409, "중지된 API입니다.")
            model = eligible(endpoint["model_id"], con)
            if (
                con.execute(
                    "SELECT count(*) FROM objects WHERE kind='job' AND json_extract(body, '$.request.kind')='inference' AND json_extract(body, '$.status') IN ('queued','running')"
                ).fetchone()[0]
                >= 32
            ):
                raise HTTPException(
                    429,
                    "API 요청 대기열이 가득 찼습니다. 잠시 후 다시 요청하세요.",
                    headers={"Retry-After": "30"},
                )
            folder.mkdir(parents=True)
            created = True
            path = folder / ("input" + suffix)
            path.write_bytes(content)
            row = {
                "id": jid,
                "product_id": jid,
                "image": str(path),
                "sha256": hashlib.sha256(content).hexdigest(),
                "source": "model_api",
                "split": "inference",
                "category": category,
                "schema_id": t.CURRENT,
                "target": empty_target(category),
                "label_state": "unlabeled",
                "label_source": "모델 API 입력",
                "human_verified": False,
                "unscored_fields": list(t.FIELDS),
            }
            job = {
                "id": jid,
                "created_at": s.now(),
                "status": "queued",
                "progress": {},
                "cancel_requested": False,
                "result": None,
                "error": None,
                "input_row": row,
                "request": {
                    "kind": "inference",
                    "dataset_id": None,
                    "model_id": model["id"],
                    "endpoint_id": eid,
                    "category": category,
                    "seed": 42,
                    "max_steps": 1,
                    "sample_limit": 1,
                    "split": "inference",
                },
            }
            s.save("job", job, con)
    except BaseException:
        if created:
            shutil.rmtree(folder)
        raise
    return public_prediction(job)


@router.post(
    "/model-endpoints/{eid}/predictions",
    status_code=202,
    responses={200: {"description": "wait=true 요청의 처리가 완료됐습니다."}},
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file"],
                        "properties": {"file": {"type": "string", "format": "binary"}},
                    }
                }
            },
        }
    },
)
async def predict(
    eid: str,
    request: Request,
    response: Response,
    wait: bool = Query(
        default=False,
        description="결과를 최대 120초 기다립니다. 완료 시 200, 대기 중이면 202와 result_url을 반환합니다.",
    ),
    category: str | None = Query(default=None, include_in_schema=False),
):
    if (
        not request.headers.get("content-type", "")
        .lower()
        .startswith("multipart/form-data")
    ):
        raise HTTPException(
            415, "multipart/form-data의 file 항목으로 이미지를 보내세요."
        )

    async def stream():
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_IMAGE + 1024 * 1024:
                raise HTTPException(413, "이미지는 20MB 이내로 보내세요.")
            yield chunk

    try:
        form = await MultiPartParser(
            request.headers,
            stream(),
            max_files=1,
            max_fields=0,
            max_part_size=MAX_IMAGE,
        ).parse()
    except MultiPartException as exc:
        raise HTTPException(422, "file 항목에 이미지 한 장을 첨부하세요.") from exc
    try:
        items = form.multi_items()
        if (
            len(items) != 1
            or items[0][0] != "file"
            or not isinstance(items[0][1], UploadFile)
        ):
            raise ValueError("file 항목에 이미지 한 장을 첨부하세요.")
        content = await items[0][1].read(MAX_IMAGE + 1)
        prediction = await run_in_threadpool(enqueue, eid, category, content)
    finally:
        await form.close()
    if not wait:
        return prediction
    deadline = asyncio.get_running_loop().time() + WAIT_SECONDS
    while True:
        job = await run_in_threadpool(s.get, "job", prediction["id"])
        if job["status"] in ("succeeded", "failed", "cancelled"):
            response.status_code = 200
            return await run_in_threadpool(public_prediction, job)
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0 or await request.is_disconnected():
            return await run_in_threadpool(public_prediction, job)
        await asyncio.sleep(min(0.25, remaining))
