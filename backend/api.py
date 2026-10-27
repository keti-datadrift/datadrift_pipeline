import asyncio
import hashlib
import json
import random
import os
import copy
from contextlib import asynccontextmanager
from typing import Literal
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse, Response
from pydantic import BaseModel, Field, ConfigDict
from . import store as s
from .catalog import initialize, import_labeled, model_available
from . import taxonomy


@asynccontextmanager
async def lifespan(app):
    initialize()
    yield


app = FastAPI(
    title="DataDrift · Attribute Extraction",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.exception_handler(KeyError)
async def missing(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def invalid(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.middleware("http")
async def same_origin(request: Request, call_next):
    origin = request.headers.get("origin")
    # Same-origin browser writes only. CLI calls without Origin are permitted on the trusted network.
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin:
        from urllib.parse import urlsplit

        if origin != os.environ.get("DATADRIFT_PUBLIC_ORIGIN") and urlsplit(
            origin
        ).netloc != request.headers.get("host"):
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=403, content={"detail": "Cross-origin write refused"}
            )
    return await call_next(request)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Workspace(Strict):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    task: Literal["attribute_extraction"] = "attribute_extraction"


class Rename(Strict):
    name: str = Field(min_length=1, max_length=100)
    status: Literal["ready", "archived"] = "ready"


class LabelEdit(Strict):
    target: dict[str, str | list[str]]
    unscored_fields: list[str] = Field(default_factory=list, max_length=14)
    human_verified: bool = False
    note: str = Field(default="", max_length=1000)


class Reconstruction(Strict):
    workspace_id: str
    name: str = Field(min_length=1, max_length=100)
    dataset_ids: list[str] = Field(min_length=1, max_length=8)
    train_budget: int = Field(ge=1, le=100000)
    seed: int = Field(default=42, ge=0, le=2147483647)

    method: Literal["source_balanced", "random"] = "source_balanced"


class Job(Strict):
    kind: Literal["training", "evaluation", "drift", "labeling"]
    dataset_id: str
    model_id: str | None = None
    reference_id: str | None = None
    max_steps: int = Field(default=20, ge=1, le=10000)
    learning_rate: float = Field(default=2e-5, gt=0, le=0.01)
    sample_limit: int = Field(default=8, ge=1, le=10000)
    split: Literal["validation", "test"] = "validation"
    threshold: float = Field(default=0.1, gt=0, le=1)
    seed: int = Field(default=42, ge=0, le=2147483647)
    sampling: Literal["random", "source_balanced"] = "random"


@app.get("/api/health")
def health():
    with s.db() as c:
        c.execute("SELECT 1")
    return {"status": "ok", "task": "attribute_extraction"}


@app.get("/api/experiments/relabel-drift")
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


@app.get("/api/workspaces")
def workspaces():
    ds = s.all_of("dataset")
    return [
        w
        | {
            "datasets": [
                s.public_dataset(d) for d in ds if d["workspace_id"] == w["id"]
            ]
        }
        for w in s.all_of("workspace")
    ]


@app.post("/api/workspaces", status_code=201)
def create_workspace(body: Workspace):
    return s.save(
        "workspace", body.model_dump() | {"id": s.uid(), "created_at": s.now()}
    )


@app.patch("/api/workspaces/{wid}")
def edit_workspace(wid: str, body: Workspace):
    return s.patch("workspace", wid, **body.model_dump())


@app.post("/api/imports/labeled")
def imports():
    from .migrate_taxonomy import migrate

    imported = import_labeled()
    return migrate({d["id"] for d in imported})


@app.get("/api/datasets")
def datasets(workspace_id: str | None = None):
    return [
        s.public_dataset(d)
        for d in s.all_of("dataset")
        if workspace_id is None or d["workspace_id"] == workspace_id
    ]


@app.get("/api/datasets/{did}")
def dataset(did: str):
    return s.public_dataset(s.get("dataset", did))


@app.get("/api/datasets/{did}/samples")
def samples(
    did: str,
    split: Literal["train", "validation", "test"] | None = None,
    source: str | None = None,
    q: str = "",
    offset: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
):
    rows = [
        r
        for r in s.get("dataset", did)["rows"]
        if (split is None or r["split"] == split)
        and (source is None or r["source"] == source)
        and q.lower()
        in json.dumps(
            r["target"] | {"product_id": r["product_id"]}, ensure_ascii=False
        ).lower()
    ]
    return {
        "total": len(rows),
        "items": [
            {k: v for k, v in r.items() if k != "image"}
            for r in rows[offset : offset + limit]
        ],
    }


@app.get("/api/datasets/{did}/images/{sid}")
def image(did: str, sid: str):
    row = next((r for r in s.get("dataset", did)["rows"] if r["id"] == sid), None)
    if not row:
        raise HTTPException(404, "Image not found")
    path = Path(row["image"])
    if not path.is_file():
        raise HTTPException(404, "Source image unavailable")
    return FileResponse(
        path,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/label-schema")
def label_schema(schema_id: str = taxonomy.CURRENT, category: str | None = None):
    return taxonomy.schema(schema_id, category)


@app.get("/api/taxonomy")
def taxonomy_definition():
    return taxonomy.BOOK | {
        "field_names": taxonomy.NAMES,
        "categories_with_attributes": taxonomy.CATEGORIES,
    }


@app.post("/api/datasets/{did}/samples/{sid}/labels", status_code=201)
def edit_labels(did: str, sid: str, body: LabelEdit):
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        original = s.get("dataset", did, c)
        version = copy.deepcopy(original)
        row = next((r for r in version["rows"] if r["id"] == sid), None)
        if row is None:
            raise HTTPException(404, "Sample not found")
        schema_id = original.get("schema_id", taxonomy.LEGACY)
        if not taxonomy.valid(body.target, schema_id, row.get("category")):
            raise ValueError("선택한 기준과 카테고리의 속성·허용값을 확인하세요.")
        if not set(body.unscored_fields) <= set(
            taxonomy.schema(schema_id, row.get("category"))
        ):
            raise ValueError("평가 제외 속성이 올바르지 않습니다.")
        timestamp, vid = s.now(), s.uid()
        row.setdefault("original_label_source", row.get("label_source", "unknown"))
        row.setdefault("label_history", []).append(
            {
                "at": timestamp,
                "parent_dataset_id": did,
                "before": {
                    "target": copy.deepcopy(row["target"]),
                    "unscored_fields": row.get("unscored_fields", []),
                    "human_verified": row.get("human_verified", False),
                    "label_source": row.get("label_source", "unknown"),
                },
                "note": body.note,
                "channel": "manual_web_or_api",
            }
        )
        row.update(
            target=body.target,
            unscored_fields=sorted(set(body.unscored_fields)),
            human_verified=body.human_verified,
            label_source="수동 레이블 · 사용자 검토 완료"
            if body.human_verified
            else "수동 레이블 · 검토 중",
            reviewed_at=timestamp if body.human_verified else None,
        )
        base_name = original.get("annotation_base_name", original["name"])
        version.update(
            id=vid,
            name=f"{base_name} · 레이블 수정 {vid[:6]}",
            annotation_base_name=base_name,
            created_at=timestamp,
            kind="annotation",
            parent_ids=[did],
            provenance="수동 수정본 · 원본 레이블 및 분할 보존",
            fingerprint=hashlib.sha256(
                json.dumps(version["rows"], sort_keys=True, ensure_ascii=False).encode()
            ).hexdigest(),
        )
        s.save("dataset", version, c)
    return {
        "dataset": s.public_dataset(version),
        "sample": {k: v for k, v in row.items() if k != "image"},
    }


@app.get("/api/datasets/{did}/export")
def export(did: str):
    d = s.get("dataset", did)
    # Export portable provenance; image bytes remain in the controlled source storage.
    content = (
        "\n".join(
            json.dumps({k: v for k, v in r.items() if k != "image"}, ensure_ascii=False)
            for r in d["rows"]
        )
        + "\n"
    )
    return Response(
        content,
        media_type="application/x-ndjson",
        headers={"Content-Disposition": f'attachment; filename="{did}.jsonl"'},
    )


def reconstruct(body: Reconstruction):
    s.get("workspace", body.workspace_id)
    parents = [s.get("dataset", did) for did in dict.fromkeys(body.dataset_ids)]
    schema_ids = {d.get("schema_id", taxonomy.LEGACY) for d in parents}
    if len(schema_ids) != 1:
        raise ValueError("서로 다른 레이블 기준은 함께 재구성할 수 없습니다.")
    unique = {}
    for d in parents:
        for row in d["rows"]:
            key = row["sha256"]
            if key in unique and (
                unique[key]["split"] != row["split"]
                or unique[key]["target"] != row["target"]
            ):
                raise ValueError("Overlapping samples have conflicting split or labels")
            unique[key] = row
    train = sorted(
        [r for r in unique.values() if r["split"] == "train"], key=lambda r: r["id"]
    )
    if body.train_budget > len(train):
        raise ValueError(f"학습 데이터는 최대 {len(train)}개입니다.")
    rng = random.Random(body.seed)
    if body.method == "random":
        selected = rng.sample(train, body.train_budget)
    else:
        groups = {
            source: [r for r in train if r["source"] == source]
            for source in sorted({r["source"] for r in train})
        }
        for group in groups.values():
            rng.shuffle(group)
        selected = []
        while len(selected) < body.train_budget:
            for group in groups.values():
                if group and len(selected) < body.train_budget:
                    selected.append(group.pop())
    heldout = [r for r in unique.values() if r["split"] != "train"]
    selected = selected + heldout
    fingerprint = hashlib.sha256(
        json.dumps(selected, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    return {
        "id": s.uid(),
        "workspace_id": body.workspace_id,
        "name": body.name,
        "created_at": s.now(),
        "kind": "reconstruction",
        "schema_id": next(iter(schema_ids)),
        "rows": selected,
        "parent_ids": [d["id"] for d in parents],
        "fingerprint": fingerprint,
        "settings": body.model_dump(),
        "provenance": "원본 레이블·분할 유지",
    }


@app.post("/api/reconstructions/preview")
def preview(body: Reconstruction):
    return s.public_dataset(reconstruct(body))


@app.post("/api/reconstructions", status_code=201)
def create_reconstruction(body: Reconstruction):
    return s.public_dataset(s.save("dataset", reconstruct(body)))


@app.get("/api/models")
def models():
    return [m | {"available": model_available(m)} for m in s.all_of("model")]


@app.patch("/api/models/{mid}")
def rename_model(mid: str, body: Rename):
    return s.patch("model", mid, **body.model_dump(exclude_unset=True))


@app.get("/api/models/{mid}")
def model(mid: str):
    m = s.get("model", mid)
    return m | {"available": model_available(m)}


@app.post("/api/jobs", status_code=201)
def create_job(body: Job):
    d = s.get("dataset", body.dataset_id)
    if body.kind == "labeling":
        from .relabeling import TEACHER

        if d.get("schema_id") != taxonomy.CURRENT or not d["rows"]:
            raise ValueError("비케이브 기준의 데이터셋을 선택하세요.")
        if body.model_id or body.reference_id:
            raise ValueError("재레이블링은 고정 Gemma-4-12B 교사를 사용합니다.")
        if not (TEACHER / "config.json").is_file():
            raise ValueError("로컬 레이블링 모델이 없습니다.")
    elif body.kind == "drift":
        if not body.reference_id or body.reference_id == body.dataset_id:
            raise ValueError("서로 다른 비교 데이터셋을 선택하세요.")
        ref = s.get("dataset", body.reference_id)
        if ref.get("schema_id", taxonomy.LEGACY) != d.get("schema_id", taxonomy.LEGACY):
            raise ValueError("같은 레이블 기준의 데이터셋끼리 비교하세요.")
        if not d["rows"] or not ref["rows"]:
            raise ValueError("Empty comparison dataset")
    else:
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
    return s.save("job", job)


@app.get("/api/jobs")
def jobs(kind: Literal["training", "evaluation", "drift", "labeling"] | None = None):
    return [j for j in s.all_of("job") if kind is None or j["request"]["kind"] == kind]


@app.get("/api/jobs/{jid}")
def job(jid: str):
    return s.get("job", jid)


@app.post("/api/jobs/{jid}/cancel")
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


@app.get("/api/jobs/{jid}/logs")
def logs(jid: str):
    s.get("job", jid)
    file = s.ROOT / "jobs" / jid / "process.log"
    return {"text": file.read_text(errors="replace")[-60000:] if file.exists() else ""}


@app.get("/api/jobs/{jid}/events")
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
