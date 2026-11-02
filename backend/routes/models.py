"""Models HTTP endpoints."""

from fastapi import APIRouter

from backend.catalog import model_available
from backend.data import store as s
from backend.schemas import taxonomy
from backend.schemas.contracts import Rename

router = APIRouter()


@router.get("/api/labeling-models")
def labeling_models(schema_id: str = taxonomy.CURRENT):
    from backend.relabeling import TEACHER

    taxonomy.schema(schema_id)
    return [
        m
        for m in models(summary=True)
        if m["kind"] == "base" or m.get("schema_id", taxonomy.LEGACY) == schema_id
    ] + [
        {
            "id": "gemma4_teacher",
            "name": "Gemma-4-12B",
            "family": "gemma4",
            "kind": "base",
            "status": "ready",
            "available": (TEACHER / "config.json").is_file(),
        }
    ]


@router.get("/api/models")
def models(summary: bool = False):
    fields = {
        "id",
        "name",
        "schema_id",
        "family",
        "kind",
        "status",
        "created_at",
        "training_job_id",
        "dataset_id",
        "parent_id",
    }
    return [
        ({k: v for k, v in m.items() if k in fields} if summary else m)
        | {"available": model_available(m)}
        for m in s.all_of("model")
        if not m.get("retired_at")
    ]


@router.patch("/api/models/{mid}")
def rename_model(mid: str, body: Rename):
    if s.get("model", mid).get("retired_at"):
        raise KeyError("사용 목록에서 제거된 모델입니다.")
    return s.patch("model", mid, **body.model_dump(exclude_unset=True))


@router.get("/api/models/{mid}")
def model(mid: str):
    m = s.get("model", mid)
    if m.get("retired_at"):
        raise KeyError("사용 목록에서 제거된 모델입니다.")
    return m | {"available": model_available(m)}


@router.get("/api/label-schema")
def label_schema(schema_id: str = taxonomy.CURRENT, category: str | None = None):
    return taxonomy.schema(schema_id, category)


@router.get("/api/taxonomy")
def taxonomy_definition():
    return taxonomy.BOOK | {
        "field_names": taxonomy.NAMES,
        "categories_with_attributes": taxonomy.CATEGORIES,
    }
