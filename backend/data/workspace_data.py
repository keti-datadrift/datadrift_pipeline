"""Workspace collection revisions and labeling updates."""

import copy
import hashlib
import json

from fastapi import HTTPException

from backend.data import store as s


def current(wid, con):
    row = con.execute(
        "SELECT dataset_id FROM workspace_data WHERE workspace_id=?", (wid,)
    ).fetchone()
    return s.get("dataset", row[0], con) if row and row[0] else None


def publish(dataset, con):
    s.get("workspace", dataset["workspace_id"], con)
    s.save("dataset", dataset, con)
    point(dataset["workspace_id"], dataset["id"], con)
    return dataset


def point(wid, did, con):
    con.execute(
        "INSERT INTO workspace_data VALUES (?,?) ON CONFLICT(workspace_id) DO UPDATE SET dataset_id=excluded.dataset_id",
        (wid, did),
    )


def revision(base, rows, **fields):
    result = copy.deepcopy(base)
    result.update(
        id=s.uid(), created_at=s.now(), parent_ids=[base["id"]], rows=rows, **fields
    )
    result["fingerprint"] = hashlib.sha256(
        json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    return result


def set_split(row, split, timestamp):
    if row["split"] == split:
        return 0
    row.setdefault("split_history", []).append(
        {"at": timestamp, "before": row["split"], "after": split}
    )
    row["split"] = split
    return 1


def label_signature(row):
    return [
        row.get(k)
        for k in (
            "target",
            "category",
            "unscored_fields",
            "human_verified",
            "label_state",
            "reviewed_at",
            "label_history",
            "label_source",
            "ai_label",
        )
    ]


def editable(original, sid, con):
    active = current(original["workspace_id"], con)
    # Direct API datasets may not have a workspace collection pointer.
    tracked = con.execute(
        "SELECT 1 FROM workspace_data WHERE workspace_id=?", (original["workspace_id"],)
    ).fetchone()
    if not active and tracked:
        raise HTTPException(409, "삭제된 데이터입니다. 목록을 새로고침하세요.")
    if active and active["id"] != original["id"]:
        before = next((r for r in original["rows"] if r["id"] == sid), None)
        after = next((r for r in active["rows"] if r["id"] == sid), None)
        if not before or not after or label_signature(before) != label_signature(after):
            raise HTTPException(
                409,
                "이 이미지의 레이블이 변경되거나 삭제되었습니다. 다시 열어 확인하세요.",
            )
        return active
    return original


def apply_labels(source, labeled, con):
    active = current(source["workspace_id"], con)
    if not active:
        return None, 0
    before = {r["id"]: r for r in source["rows"]}
    predictions = {r["id"]: r for r in labeled["rows"]}
    rows, applied = [], 0
    for row in active["rows"]:
        old = before.get(row["id"])
        prediction = predictions.get(row["id"])
        if old and prediction and label_signature(row) == label_signature(old):
            # Retain split edits made during labeling.
            updated = copy.deepcopy(prediction)
            updated["split"] = row["split"]
            if "split_history" in row:
                updated["split_history"] = copy.deepcopy(row["split_history"])
            rows.append(updated)
            applied += 1
        else:
            rows.append(row)
    if not applied:
        return active, 0
    if active["id"] == source["id"]:
        publish(labeled, con)
        return labeled, applied
    merged = revision(
        active,
        rows,
        kind="ai_relabel",
        labeling_job_id=labeled["labeling_job_id"],
        labeling_model_id=labeled["labeling_model_id"],
    )
    publish(merged, con)
    return merged, applied
