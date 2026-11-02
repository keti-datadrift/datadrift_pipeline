"""Reversible catalog deletion. Shared image files and completed runs stay intact."""

import copy
import hashlib
import json

from fastapi import HTTPException

from backend.data import store as s
from backend.data import workspace_data as wd


def plan(kind, key, sample_ids, con):
    obj = s.get("workspace" if kind == "workspace" else "dataset", key, con)
    if kind == "workspace":
        datasets = [d for d in s.all_of("dataset", con) if d["workspace_id"] == key]
    else:
        datasets = [obj]
    active = wd.current(key if kind == "workspace" else obj["workspace_id"], con)
    if kind != "workspace" and active and active["id"] != key:
        raise HTTPException(409, "데이터가 변경되었습니다. 목록을 새로고침하세요.")
    selected = set(sample_ids)
    if kind == "samples":
        if not selected or not selected <= {r["id"] for r in obj["rows"]}:
            raise ValueError("삭제할 이미지를 다시 선택하세요.")
    elif selected:
        raise ValueError("이미지 선택은 이미지 삭제에서만 사용합니다.")
    ids = {d["id"] for d in datasets}
    active_jobs = [
        j
        for j in s.all_of("job", con)
        if j["status"] in ("queued", "running")
        and ids.intersection(
            {j["request"].get("dataset_id"), j["request"].get("reference_id")}
        )
    ]
    if active_jobs:
        raise HTTPException(
            409,
            f"이 데이터를 사용하는 작업 {len(active_jobs)}개가 대기 또는 실행 중입니다. 작업 종료 후 삭제하세요.",
        )
    objects = [("dataset", d) for d in datasets]
    if kind == "workspace":
        objects.append(("workspace", obj))
    token = hashlib.sha256(
        json.dumps(
            [objects, sorted(selected)], sort_keys=True, ensure_ascii=False
        ).encode()
    ).hexdigest()
    return objects, {
        "kind": kind,
        "id": key,
        "name": obj["name"],
        "token": token,
        "dataset_count": int(bool(active)) if kind == "workspace" else len(datasets),
        "head_before": active["id"] if active else None,
        "sample_ids": sorted(selected),
        "sample_count": len(selected)
        if kind == "samples"
        else len(active["rows"])
        if kind == "workspace" and active
        else sum(len(d["rows"]) for d in datasets),
        "remaining_count": len(obj["rows"]) - len(selected) if kind == "samples" else 0,
        "workspace_id": key if kind == "workspace" else obj["workspace_id"],
    }


def preview(kind, key, sample_ids):
    with s.db() as con:
        con.execute("BEGIN")
        return plan(kind, key, sample_ids, con)[1]


def delete(kind, key, sample_ids, token):
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        objects, summary = plan(kind, key, sample_ids, con)
        if summary["token"] != token:
            raise HTTPException(
                409, "데이터가 변경되었습니다. 창을 닫고 삭제 대상을 다시 확인하세요."
            )
        batch_id = s.uid()
        replacement = None
        if kind == "samples" and summary["remaining_count"]:
            original = objects[0][1]
            replacement = copy.deepcopy(original)
            replacement["rows"] = [
                r for r in original["rows"] if r["id"] not in set(sample_ids)
            ]
            replacement.update(
                id=s.uid(),
                name=original["name"],
                created_at=s.now(),
                kind="filtered",
                parent_ids=[key],
                provenance="선택 이미지 삭제 후 저장",
                deletion_batch_id=batch_id,
                fingerprint=hashlib.sha256(
                    json.dumps(
                        replacement["rows"], sort_keys=True, ensure_ascii=False
                    ).encode()
                ).hexdigest(),
            )
            for field in (
                "labeling_job_id",
                "labeling_model_id",
                "teacher",
                "label_coverage",
            ):
                replacement.pop(field, None)
            wd.publish(replacement, con)
        entry = {k: v for k, v in summary.items() if k != "token"} | {
            "id": batch_id,
            "target_id": key,
            "deleted_at": s.now(),
            "replacement_id": replacement["id"] if replacement else None,
        }
        con.execute(
            "INSERT INTO deletion_batches VALUES (?,?)",
            (batch_id, json.dumps(entry, ensure_ascii=False)),
        )
        for object_kind, obj in objects:
            con.execute(
                "INSERT INTO deleted_objects VALUES (?,?,?,?)",
                (object_kind, obj["id"], batch_id, json.dumps(obj, ensure_ascii=False)),
            )
            con.execute(
                "DELETE FROM objects WHERE kind=? AND id=?", (object_kind, obj["id"])
            )
        if not replacement:
            wd.point(summary["workspace_id"], None, con)
        return entry | {
            "dataset": s.public_dataset(replacement) if replacement else None
        }


def entries():
    with s.db() as con:
        return [
            json.loads(r[0])
            for r in con.execute(
                "SELECT body FROM deletion_batches ORDER BY rowid DESC"
            )
        ]


def restore(batch_id):
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        entry = con.execute(
            "SELECT body FROM deletion_batches WHERE id=?", (batch_id,)
        ).fetchone()
        if not entry:
            raise KeyError("삭제 항목을 찾을 수 없습니다.")
        entry = json.loads(entry[0])
        objects = [
            (r["kind"], json.loads(r["body"]))
            for r in con.execute(
                "SELECT kind,body FROM deleted_objects WHERE batch_id=?", (batch_id,)
            )
        ]
        restored_workspaces = {o["id"] for kind, o in objects if kind == "workspace"}
        for kind, obj in objects:
            if con.execute(
                "SELECT 1 FROM objects WHERE kind=? AND id=?", (kind, obj["id"])
            ).fetchone():
                raise HTTPException(
                    409, "같은 ID의 데이터가 있습니다. 복원할 수 없습니다."
                )
            if kind == "dataset" and obj["workspace_id"] not in restored_workspaces:
                try:
                    s.get("workspace", obj["workspace_id"], con)
                except KeyError:
                    raise HTTPException(
                        409, "워크스페이스를 먼저 복원하세요."
                    ) from None
        active = wd.current(entry["workspace_id"], con)
        # Remove tombstones only within the transaction that restores every object.
        con.execute("DELETE FROM deleted_objects WHERE batch_id=?", (batch_id,))
        for kind, obj in objects:
            s.save(kind, obj, con)
        if entry["kind"] == "workspace":
            wd.point(entry["workspace_id"], entry.get("head_before"), con)
        else:
            restored = next(obj for kind, obj in objects if kind == "dataset")
            selected = set(entry.get("sample_ids", []))
            restored_rows = [
                r for r in restored["rows"] if not selected or r["id"] in selected
            ]
            current_rows = active["rows"] if active else []
            known = {r["sha256"] for r in current_rows}
            merged_rows = current_rows + [
                r for r in restored_rows if r["sha256"] not in known
            ]
            # Restoring removed images must not undo labels edited after the deletion.
            if active or selected:
                merged = wd.revision(
                    active or restored,
                    merged_rows,
                    kind="restored",
                    provenance="삭제 데이터 복원",
                )
                wd.publish(merged, con)
            else:
                wd.publish(restored, con)
        con.execute("DELETE FROM deletion_batches WHERE id=?", (batch_id,))
        return entry
