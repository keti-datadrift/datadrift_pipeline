"""Workspaces HTTP endpoints."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request

from backend.catalog import import_labeled
from backend.data import store as s
from backend.data import workspace_data as wd
from backend.schemas.contracts import Workspace
from backend.schemas.validation import selected_labeling_model, workspace_labeling_model

router = APIRouter()


@router.get("/api/workspaces")
def workspaces():
    ds = s.dataset_summaries(current_only=True)
    names = {m["id"]: m["name"] for m in s.all_of("model")}
    names["gemma4_teacher"] = "Gemma-4-12B"
    result = []
    for w in s.all_of("workspace"):
        data = [d for d in ds if d["workspace_id"] == w["id"]]
        mid = workspace_labeling_model(w, data[0] if data else None)
        result.append(
            w
            | {
                "datasets": data,
                "labeling_model_id": mid,
                "labeling_model_name": names.get(mid, mid),
            }
        )
    return result


@router.post("/api/workspaces", status_code=201)
def create_workspace(body: Workspace):
    if body.labeling_model_id:
        selected_labeling_model(body.labeling_model_id)
    return s.save(
        "workspace", body.model_dump() | {"id": s.uid(), "created_at": s.now()}
    )


@router.patch("/api/workspaces/{wid}")
def edit_workspace(wid: str, body: Workspace):
    current = s.get("workspace", wid)
    if body.labeling_model_id and body.labeling_model_id != current.get(
        "labeling_model_id"
    ):
        selected_labeling_model(body.labeling_model_id)
    return s.patch("workspace", wid, **body.model_dump(exclude_unset=True))


@router.post("/api/imports/labeled")
def imports():
    from backend.migrate_taxonomy import migrate

    imported = import_labeled()
    migrated = migrate({d["id"] for d in imported})
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        for dataset in migrated:
            wid = dataset["workspace_id"]
            if not con.execute(
                "SELECT 1 FROM workspace_data WHERE workspace_id=?", (wid,)
            ).fetchone():
                s.get("workspace", wid, con)
                wd.point(wid, dataset["id"], con)
    return migrated


@router.post(
    "/api/workspaces/{wid}/images",
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["files"],
                        "properties": {
                            "files": {
                                "type": "array",
                                "items": {"type": "string", "format": "binary"},
                            }
                        },
                    }
                }
            },
        }
    },
)
async def upload_images(
    wid: str,
    request: Request,
    name: str = Query(min_length=1, max_length=100),
    category: Literal["아우터", "상의", "하의", "ACC"] | None = None,
    split: Literal["unassigned", "train", "validation", "test"] = "train",
):
    from starlette.concurrency import run_in_threadpool
    from starlette.datastructures import UploadFile
    from starlette.formparsers import MultiPartException, MultiPartParser

    from backend.data.uploads import MAX_BATCH, MAX_FILES, MAX_IMAGE, import_images

    s.get("workspace", wid)
    name = name.strip()
    if not name:
        raise ValueError("데이터셋 이름을 입력하세요.")
    if not request.headers.get("content-type", "").startswith("multipart/form-data"):
        raise HTTPException(415, "이미지 파일을 multipart/form-data로 전송하세요.")

    class SizeLimit(MultiPartException):
        pass

    async def limited_stream():
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BATCH + 1024 * 1024:
                raise SizeLimit("한 번에 100MB까지 업로드할 수 있습니다.")
            yield chunk

    try:
        form = await MultiPartParser(
            request.headers,
            limited_stream(),
            max_files=MAX_FILES,
            max_fields=0,
            max_part_size=MAX_IMAGE,
        ).parse()
    except SizeLimit as exc:
        raise HTTPException(413, exc.message) from exc
    except MultiPartException as exc:
        raise HTTPException(
            422, "업로드 형식 또는 파일 수를 확인하세요. " + exc.message
        ) from exc
    try:
        items = form.multi_items()
        if any(
            key != "files" or not isinstance(value, UploadFile) for key, value in items
        ):
            raise ValueError("files 항목에 이미지 파일을 첨부하세요.")
        return await run_in_threadpool(
            import_images, [v for _, v in items], wid, name, category, split
        )
    finally:
        await form.close()
