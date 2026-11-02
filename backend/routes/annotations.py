"""Annotations HTTP endpoints."""

import copy
import hashlib
import json

from fastapi import APIRouter, HTTPException

from backend.data import store as s
from backend.data import workspace_data as wd
from backend.data.sample_view import public_sample
from backend.schemas import taxonomy
from backend.schemas.contracts import LabelEdit, SplitEdit

router = APIRouter()


@router.post("/api/datasets/{did}/samples/{sid}/labels", status_code=201)
def edit_labels(did: str, sid: str, body: LabelEdit):
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        opened = s.get("dataset", did, c)
        original = wd.editable(opened, sid, c)
        if body.split is not None and opened["id"] != original["id"]:
            before = next(r for r in opened["rows"] if r["id"] == sid)
            after = next(r for r in original["rows"] if r["id"] == sid)
            if before["split"] != after["split"]:
                raise HTTPException(
                    409, "데이터 구분이 변경되었습니다. 다시 열어 확인하세요."
                )
        did = original["id"]
        version = copy.deepcopy(original)
        row = next((r for r in version["rows"] if r["id"] == sid), None)
        if row is None:
            raise HTTPException(404, "Sample not found")
        schema_id = original.get("schema_id", taxonomy.LEGACY)
        previous_category = row.get("category")
        if schema_id == taxonomy.CURRENT:
            if body.category is not None:
                row["category"] = body.category
            if taxonomy.category(row.get("category")) not in taxonomy.CATEGORIES:
                raise ValueError("상품 카테고리를 선택하세요.")
        if not taxonomy.valid(body.target, schema_id, row.get("category")):
            raise ValueError("선택한 기준과 카테고리의 속성·허용값을 확인하세요.")
        if not set(body.unscored_fields) <= set(
            taxonomy.schema(schema_id, row.get("category"))
        ):
            raise ValueError("평가 제외 속성이 올바르지 않습니다.")
        timestamp, vid = s.now(), s.uid()
        if body.split is not None:
            wd.set_split(row, body.split, timestamp)
        row.setdefault("original_label_source", row.get("label_source", "unknown"))
        row.setdefault("label_history", []).append(
            {
                "at": timestamp,
                "parent_dataset_id": did,
                "before": {
                    "target": copy.deepcopy(row["target"]),
                    "category": previous_category,
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
        if "label_state" in row:
            row["label_state"] = (
                "labeled"
                if any(
                    key not in row["unscored_fields"]
                    and value not in ("unknown", "not_applicable")
                    for key, value in row["target"].items()
                )
                else "unlabeled"
            )
        base_name = original.get("annotation_base_name", original["name"])
        version.update(
            id=vid,
            name=f"{base_name} · 레이블 수정 {vid[:6]}",
            annotation_base_name=base_name,
            created_at=timestamp,
            kind="annotation",
            parent_ids=[did],
            provenance="수동 수정본",
            fingerprint=hashlib.sha256(
                json.dumps(version["rows"], sort_keys=True, ensure_ascii=False).encode()
            ).hexdigest(),
        )
        wd.publish(version, c)
    return {
        "dataset": s.public_dataset(version),
        "sample": public_sample(row),
    }


@router.delete("/api/datasets/{did}/samples/{sid}/review")
def cancel_review(did: str, sid: str):
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        opened = s.get("dataset", did, c)
        original = wd.editable(opened, sid, c)
        rows = copy.deepcopy(original["rows"])
        row = next((r for r in rows if r["id"] == sid), None)
        if row is None:
            raise HTTPException(404, "이미지를 찾을 수 없습니다.")
        if not row.get("human_verified"):
            return {"dataset": s.public_dataset(original), "sample": public_sample(row)}
        timestamp = s.now()
        row.setdefault("label_history", []).append(
            {
                "at": timestamp,
                "parent_dataset_id": original["id"],
                "channel": "review_cancelled",
                "note": "검토 취소",
                "before": {
                    "human_verified": row["human_verified"],
                    "reviewed_at": row.get("reviewed_at"),
                    "label_source": row.get("label_source"),
                },
            }
        )
        row.update(human_verified=False, reviewed_at=None)
        if row.get("label_source") == "수동 레이블 · 사용자 검토 완료":
            row["label_source"] = "수동 레이블 · 검토 대기"
        version = wd.revision(original, rows, kind="annotation", provenance="검토 취소")
        wd.publish(version, c)
    return {"dataset": s.public_dataset(version), "sample": public_sample(row)}


@router.post("/api/datasets/{did}/samples/split")
def edit_splits(did: str, body: SplitEdit):
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        original = s.get("dataset", did, c)
        active = wd.current(original["workspace_id"], c)
        if not active or active["id"] != did:
            raise HTTPException(409, "데이터가 변경되었습니다. 목록을 새로고침하세요.")
        selected = set(body.sample_ids)
        if not selected <= {r["id"] for r in original["rows"]}:
            raise HTTPException(404, "선택한 이미지를 찾을 수 없습니다.")
        rows = copy.deepcopy(original["rows"])
        timestamp = s.now()
        changed = sum(
            wd.set_split(row, body.split, timestamp)
            for row in rows
            if row["id"] in selected
        )
        version = original
        if changed:
            version = wd.revision(original, rows, kind="split_edit")
            wd.publish(version, c)
    return {"dataset": s.public_dataset(version), "changed_count": changed}
