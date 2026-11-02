"""Explicit, reversible transition of the active catalog to the default attributes."""

import copy
import json

from backend.data import store as s
from backend.data import workspace_data as wd
from backend.migrate_taxonomy import convert
from backend.schemas import taxonomy as t


def upgraded(dataset, candidates):
    """Keep current membership/splits and later user edits; reuse existing labels."""
    signatures = {(r["id"], r["sha256"]) for r in dataset["rows"]}
    matching = [
        d
        for d in candidates
        if d["workspace_id"] == dataset["workspace_id"]
        and d.get("schema_id") == t.CURRENT
        and signatures <= {(r["id"], r["sha256"]) for r in d["rows"]}
    ]
    reference = max(matching, key=lambda d: d.get("created_at", ""), default=None)
    standard = {r["id"]: r for r in reference["rows"]} if reference else {}
    rows, mapped = [], 0
    for original in dataset["rows"]:
        edited = any(
            h.get("channel") in ("manual_web_or_api", "review_cancelled")
            and h.get("at", "") > (reference or {}).get("created_at", "")
            for h in original.get("label_history", [])
        )
        if original["id"] not in standard or edited or original.get("human_verified"):
            row = convert(original)
            mapped += 1
        else:
            row = copy.deepcopy(standard[original["id"]])
            for key in ("id", "sha256", "image", "product_id", "source", "split"):
                row[key] = original[key]
            for key in ("split_history", "upload_filename"):
                if key in original:
                    row[key] = copy.deepcopy(original[key])
                else:
                    row.pop(key, None)
        assert t.valid(row["target"], t.CURRENT, row.get("category"))
        rows.append(row)
    result = wd.revision(
        dataset,
        rows,
        schema_id=t.CURRENT,
        kind="standardization",
        provenance="기본 속성 적용 · 현재 이미지와 분할 및 수정 이력 보존",
    )
    result["parent_ids"] = list(
        dict.fromkeys([dataset["id"]] + ([reference["id"]] if reference else []))
    )
    result["standardization"] = {
        "previous_dataset_id": dataset["id"],
        "reference_dataset_id": reference["id"] if reference else None,
        "mapped_rows": mapped,
    }
    return result


def apply():
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        if any(j["status"] in ("queued", "running") for j in s.all_of("job", con)):
            raise ValueError("대기·실행 중인 작업이 있습니다. 종료 후 다시 적용하세요.")
        datasets = s.all_of("dataset", con)
        retired = [
            m
            for m in s.all_of("model", con)
            if m["kind"] == "lora"
            and m.get("schema_id", t.LEGACY) != t.CURRENT
            and not m.get("retired_at")
        ]
        changes = []
        for workspace in s.all_of("workspace", con):
            current = wd.current(workspace["id"], con)
            if current and current.get("schema_id", t.LEGACY) != t.CURRENT:
                result = upgraded(current, datasets)
                wd.publish(result, con)
                changes.append(
                    {
                        "workspace_id": workspace["id"],
                        "dataset_id": result["id"],
                        **result["standardization"],
                    }
                )
            changed = False
            if workspace.get("labeling_model_id") in {m["id"] for m in retired}:
                workspace["labeling_model_id"] = None
                changed = True
            if workspace["name"] == "무신사 · BKAVE":
                workspace["name"] = "무신사"
                changed = True
            if changed:
                s.save("workspace", workspace, con)
        for model in retired:
            model.update(
                status="archived",
                retired_at=s.now(),
                retired_reason="superseded_attributes",
            )
            s.save("model", model, con)
        return {"retired_model_ids": [m["id"] for m in retired], "datasets": changes}


if __name__ == "__main__":
    import argparse
    import os
    import sqlite3

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", required=True)
    parser.parse_args()
    backup = s.ROOT / "backups" / ("before-standardize-" + s.uid() + ".sqlite")
    backup.parent.mkdir(parents=True, exist_ok=True)
    with s.db() as source, sqlite3.connect(backup) as destination:
        source.backup(destination)
    os.chmod(backup, 0o600)
    print(json.dumps({"backup": str(backup), **apply()}, ensure_ascii=False, indent=2))
