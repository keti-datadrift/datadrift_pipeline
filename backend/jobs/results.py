"""Model artifact registration and label revision publication."""

import hashlib
import json
import time

from backend.data import store as s
from backend.data import workspace_data as wd
from backend.schemas import taxonomy


def publish_model_result(job, dataset, model, folder, process_started):
    jid = job["id"]
    req = job["request"]
    inference = req["kind"] == "inference"
    labeling = req["kind"] == "labeling"
    result = json.loads((folder / "result.json").read_text())
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        latest = s.get("job", jid, c)
        if latest["cancel_requested"]:
            latest.update(status="cancelled", finished_at=s.now())
        else:
            if inference:
                row = json.loads((folder / "relabeled-rows.json").read_text())[0]
                result = {
                    "category": row.get("category"),
                    "category_valid": row["ai_label"]["category_valid"],
                    "attributes": row["target"],
                    "excluded_attributes": row["unscored_fields"],
                    "schema_valid": row["ai_label"]["schema_valid"],
                    "parse_valid": row["ai_label"]["parsed"] is not None,
                    "raw": row["ai_label"]["raw"],
                    "model_id": model["id"],
                    "schema_id": taxonomy.CURRENT,
                    "processing_seconds": round(time.monotonic() - process_started, 2),
                    "teacher": result["teacher"],
                }
            if labeling:
                rows = json.loads((folder / "relabeled-rows.json").read_text())
                if len(rows) != len(dataset["rows"]):
                    raise ValueError("Incomplete relabeling result")
                did = "relabeled-" + jid
                labeled = {
                    **dataset,
                    "id": did,
                    "name": dataset["name"] + " 자동 레이블",
                    "kind": "ai_relabel",
                    "schema_id": dataset.get("schema_id", taxonomy.LEGACY),
                    "rows": rows,
                    "created_at": s.now(),
                    "parent_ids": [dataset["id"]],
                    "labeling_job_id": jid,
                    "provenance": (model.get("name") or "Gemma-4-12B")
                    + " 자동 레이블링, 사람 검토 전",
                    "labeling_model_id": req.get("model_id") or "gemma4_teacher",
                    "fingerprint": hashlib.sha256(
                        json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()
                    ).hexdigest(),
                    "label_coverage": result["label_coverage"],
                    "teacher": result["teacher"],
                }
                labeled.pop("annotation_base_name", None)
                s.save("dataset", labeled, c)
                active, applied = wd.apply_labels(dataset, labeled, c)
                result["dataset_id"] = active["id"] if active else did
                result["applied_count"] = applied
                result["skipped_changed_count"] = len(rows) - applied
                if (
                    active
                    and applied == len(rows) == len(active["rows"])
                    and applied > 0
                    and all(
                        row.get("label_state") != "unlabeled" for row in active["rows"]
                    )
                ):
                    workspace = s.get("workspace", dataset["workspace_id"], c)
                    workspace["labeling_model_id"] = labeled["labeling_model_id"]
                    s.save("workspace", workspace, c)
            if req["kind"] == "training":
                mid = "trained-" + jid
                s.save(
                    "model",
                    {
                        "id": mid,
                        "name": model["name"] + " · " + jid[:6],
                        "family": model["family"],
                        "kind": "lora",
                        "status": "ready",
                        "adapter": str(folder / "adapter"),
                        "created_at": s.now(),
                        "training_job_id": jid,
                        "dataset_id": dataset["id"],
                        "parent_id": model["id"],
                        "schema_id": result.get("schema_id", taxonomy.LEGACY),
                        "taxonomy_snapshot": result.get("taxonomy_snapshot"),
                        "prompt": result["prompt"],
                        "prompt_sha256": result["prompt_sha256"],
                    },
                    c,
                )
                result["model_id"] = mid
            latest.update(
                status="succeeded",
                finished_at=s.now(),
                result=result,
                progress=json.loads((folder / "progress.json").read_text())
                | {"elapsed_seconds": round(time.monotonic() - process_started, 2)},
            )
        s.save("job", latest, c)
