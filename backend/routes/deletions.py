"""Deletions HTTP endpoints."""

from fastapi import APIRouter

from backend.schemas.contracts import Deletion

router = APIRouter()


@router.post("/api/deletions/preview")
def deletion_preview(body: Deletion):
    from backend.data import deletions

    return deletions.preview(body.kind, body.id, body.sample_ids)


@router.post("/api/deletions", status_code=201)
def delete_data(body: Deletion):
    from backend.data import deletions

    return deletions.delete(body.kind, body.id, body.sample_ids, body.token)


@router.get("/api/deletions")
def deleted_data():
    from backend.data import deletions

    return deletions.entries()


@router.post("/api/deletions/{bid}/restore")
def restore_data(bid: str):
    from backend.data import deletions

    return deletions.restore(bid)
