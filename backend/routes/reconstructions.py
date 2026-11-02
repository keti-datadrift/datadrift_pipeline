"""Reconstructions HTTP endpoints."""

import hashlib
import json
from collections import Counter

from fastapi import APIRouter

from backend.data import reconstruction as reconstruction_sampling
from backend.data import store as s
from backend.data import workspace_data as wd
from backend.schemas import taxonomy
from backend.schemas.contracts import Reconstruction, Workspace
from backend.schemas.validation import require_labels

router = APIRouter()


def reconstruct(body: Reconstruction, con=None):
    # train_budget requests default to source-balanced sampling.
    if (
        body.train_budget is not None
        and body.data_count is None
        and "method" not in body.model_fields_set
    ):
        body = body.model_copy(update={"method": "source_balanced"})
    if body.workspace_id is not None:
        s.get("workspace", body.workspace_id, con)
    parents = [s.get("dataset", did, con) for did in dict.fromkeys(body.dataset_ids)]
    if body.data_count is not None and body.train_budget is not None:
        raise ValueError("데이터 수는 하나의 기준으로 지정하세요.")
    legacy = (
        body.data_count is None
        and body.train_budget is not None
        and body.method in ("source_balanced", "random")
    )
    input_splits = ("train",) if legacy else reconstruction_sampling.CANDIDATE_SPLITS
    if body.method != "merge":
        for parent in parents:
            if (
                body.method == "balanced_mix"
                and body.dataset_weights.get(parent["id"]) == 0
            ):
                continue
            require_labels(
                parent
                if legacy
                else {"rows": [r for r in parent["rows"] if r["split"] in input_splits]}
            )
    schema_ids = {d.get("schema_id", taxonomy.LEGACY) for d in parents}
    if len(schema_ids) != 1:
        raise ValueError("서로 다른 레이블 기준은 함께 재구성할 수 없습니다.")
    unique = {}
    for d in parents:
        for row in d["rows"]:
            key = row["sha256"]
            if key in unique and (
                (
                    unique[key]["split"] != row["split"]
                    and not {unique[key]["split"], row["split"]} <= set(input_splits)
                )
                or unique[key]["target"] != row["target"]
            ):
                raise ValueError("Overlapping samples have conflicting split or labels")
            unique[key] = row
    candidates = sorted(
        [r for r in unique.values() if r["split"] in input_splits],
        key=lambda r: r["id"],
    )
    if body.method == "merge" and any(
        count is not None and count != len(candidates)
        for count in (body.data_count, body.train_budget)
    ):
        raise ValueError("전체 합치기는 데이터 수를 지정하지 않습니다.")
    reference = None
    if body.method == "distribution":
        reference = next((d for d in parents if d["id"] == body.reference_id), None)
        if reference is None:
            raise ValueError("선택한 원본 중 기준 워크스페이스를 지정하세요.")
    count = body.data_count if body.data_count is not None else body.train_budget
    if body.method == "balanced_mix":
        selected, distribution = reconstruction_sampling.balanced_mix(
            parents, count, body.seed, body.dataset_weights
        )
    else:
        if body.dataset_weights:
            raise ValueError("혼합 비율은 균형 혼합에서만 지정할 수 있습니다.")
        selected, distribution = reconstruction_sampling.select(
            candidates,
            count,
            body.method,
            body.seed,
            list(
                {
                    r["sha256"]: r
                    for r in reference["rows"]
                    if r["split"] in input_splits
                }.values()
            )
            if reference
            else None,
        )
    selected_count = len(selected)
    promoted_count = sum(r["split"] == "unassigned" for r in selected)
    selected = [
        r | {"split": "train", "source_split": "unassigned"}
        if r["split"] == "unassigned"
        else r
        for r in selected
    ]
    # train_budget responses also include the original holdout rows.
    if legacy:
        selected = selected + [
            r for r in unique.values() if r["split"] in ("validation", "test")
        ]
    selection = {
        "scope": "with_holdout" if legacy else "train_only",
        "input_splits": list(input_splits),
        "promoted_count": promoted_count,
        "available_count": len(candidates),
        "selected_count": selected_count,
        "duplicate_count": sum(
            r["split"] in input_splits for d in parents for r in d["rows"]
        )
        - len(candidates),
        "by_source": dict(Counter(r["source"] for r in selected)),
    }
    if reference:
        selection.update(
            reference_id=reference["id"],
            reference_name=reference["name"],
            **distribution,
        )
    elif body.method == "balanced_mix":
        selection.update(distribution)
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
        "selection": selection,
        "provenance": "원본 레이블·분할 유지" if legacy else "학습 데이터 재구성",
    }


@router.post("/api/reconstructions/preview")
def preview(body: Reconstruction):
    return s.public_dataset(reconstruct(body))


@router.post("/api/reconstructions", status_code=201)
def create_reconstruction(body: Reconstruction):
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        dataset = reconstruct(body, con)
        if body.workspace_id is None:
            # Save the new workspace and dataset in the same transaction.
            workspace = Workspace(name=body.name).model_dump() | {
                "id": s.uid(),
                "created_at": s.now(),
            }
            s.save("workspace", workspace, con)
            dataset["workspace_id"] = workspace["id"]
        return s.public_dataset(wd.publish(dataset, con))
