"""Datasets HTTP endpoints."""

import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

from backend.data import store as s
from backend.data.sample_view import public_sample

router = APIRouter()


@router.get("/api/datasets")
def datasets(workspace_id: str | None = None, current: bool = False):
    values = s.dataset_summaries(workspace_id=workspace_id, current_only=current)
    if current:
        names = {w["id"]: w["name"] for w in s.all_of("workspace")}
        return [d | {"name": names.get(d["workspace_id"], d["name"])} for d in values]
    return values


@router.get("/api/datasets/{did}")
def dataset(did: str):
    values = s.dataset_summaries(dataset_id=did)
    if not values:
        raise KeyError(f"dataset not found: {did}")
    return values[0]


@router.get("/api/datasets/{did}/samples")
def samples(
    did: str,
    ids_only: bool = False,
    split: Literal["unassigned", "train", "validation", "test"] | None = None,
    source: str | None = None,
    q: str = "",
    review: Literal["unlabeled", "pending", "verified"] | None = None,
    attribute: str | None = None,
    value: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
):
    rows = [
        r
        for r in s.get("dataset", did)["rows"]
        if (split is None or r["split"] == split)
        and (source is None or r["source"] == source)
        and (
            review is None
            or (review == "unlabeled" and r.get("label_state") == "unlabeled")
            or (
                review == "verified"
                and r.get("human_verified")
                and r.get("label_state") != "unlabeled"
            )
            or (
                review == "pending"
                and not r.get("human_verified")
                and r.get("label_state") != "unlabeled"
            )
        )
        and (
            attribute is None
            or (
                attribute not in r.get("unscored_fields", [])
                and r["target"].get(attribute)
                not in (None, "unknown", "not_applicable")
                and (
                    value is None
                    or str(
                        sorted(r["target"][attribute])
                        if isinstance(r["target"][attribute], list)
                        else r["target"][attribute]
                    )
                    == value
                )
            )
        )
        and (
            not q
            or q.lower()
            in json.dumps(
                r["target"] | {"product_id": r["product_id"]}, ensure_ascii=False
            ).lower()
        )
    ]
    if ids_only:
        return {"total": len(rows), "ids": [r["id"] for r in rows]}
    return {
        "total": len(rows),
        "items": [public_sample(r) for r in rows[offset : offset + limit]],
    }


@router.get("/api/datasets/{did}/samples/{sid}")
def sample_detail(did: str, sid: str):
    row = next((r for r in s.get("dataset", did)["rows"] if r["id"] == sid), None)
    if row is None:
        raise HTTPException(404, "이미지를 찾을 수 없습니다.")
    return public_sample(row)


@router.get("/api/datasets/{did}/images/{sid}")
def image(did: str, sid: str):
    path = Path(s.image_path(did, sid))
    if not path.is_file():
        raise HTTPException(404, "Source image unavailable")
    return FileResponse(
        path,
        headers={
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/api/datasets/{did}/export")
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
