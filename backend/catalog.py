"""Import only approved labeled inputs; preserve original splits and provenance."""

import hashlib
import json
import os
from pathlib import Path
from . import store as s

FIELDS = [
    "pattern",
    "fit",
    "sleeve",
    "length",
    "closure",
    "details",
    "neckline",
    "hood",
    "visible_pocket",
    "cuff",
    "hem",
    "surface_texture",
    "graphic_location",
    "graphic_scale",
]


def initialize():
    with s.db() as c:
        for family, name in [("qwen35_2b", "Qwen3.5-2B"), ("qwen35_4b", "Qwen3.5-4B")]:
            try:
                s.get("model", family, c)
            except KeyError:
                s.save(
                    "model",
                    {
                        "id": family,
                        "name": name,
                        "family": family,
                        "kind": "base",
                        "status": "ready",
                        "created_at": s.now(),
                        "adapter": None,
                    },
                    c,
                )


def model_path(family):
    return (
        Path(os.environ.get("DATADRIFT_MODELS", "/data/hslim/models"))
        / {"qwen35_2b": "Qwen3.5-2B", "qwen35_4b": "Qwen3.5-4B"}[family]
    )


def model_available(model):
    if not model_path(model["family"]).is_dir():
        return False
    if model["kind"] == "lora":
        if not model.get("adapter"):
            return False
        adapter = Path(model["adapter"])
        return all(
            (adapter / name).is_file()
            for name in ("adapter_config.json", "adapter_model.safetensors")
        )
    return True


def import_labeled(root=None):
    root = Path(root or os.environ["DATADRIFT_INPUT_ROOT"]).resolve()
    review_dir = root / "bkcave_drift/experiments/vlm_methods_review1000_20261006"
    manifest = json.loads((review_dir / "split_manifest.json").read_text())
    reviews = {
        r["review_id"]: r
        for r in map(
            json.loads, (review_dir / "reviews.jsonl").read_text().splitlines()
        )
    }
    sources = {"musinsa": [], "gsshop": []}
    for item in manifest:
        review = reviews.get(item["review_id"])
        if not review or review.get("status") != "reviewed":
            continue
        if (
            review["image_sha256"] != item["sha256"]
            or review["product_id"] != item["product_id"]
        ):
            raise ValueError("Review identity mismatch")
        sources["musinsa"].append(
            item
            | {
                "target": review["target"],
                "unscored_fields": review.get("unscored_fields", []),
                "human_verified": review.get("human_verified", False),
                "label_source": review["reviewer"],
            }
        )
    sources["gsshop"] = json.loads(
        (
            root / "bkcave_drift/experiments/resnet18_gs251218_20261002/gs_labeled.json"
        ).read_text()
    )
    result = []
    # Complete validation before making any changes.
    datasets = []
    seen = {}
    for source, items in sources.items():
        normalized = []
        for item in items:
            target = {k: item["target"][k] for k in FIELDS}
            if item["split"] not in ("train", "validation", "test"):
                raise ValueError("Invalid original split")
            path = Path(item["image"]).resolve()
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            if actual != item["sha256"]:
                raise ValueError(f"Image integrity mismatch: {item['product_id']}")
            if actual in seen:
                raise ValueError("Duplicate image in input corpus")
            seen[actual] = item["split"]
            normalized.append(
                {
                    "id": source + "-" + actual[:20],
                    "product_id": item["product_id"],
                    "image": str(path),
                    "sha256": actual,
                    "source": source,
                    "split": item["split"],
                    "target": target,
                    "label_source": item["label_source"],
                    "human_verified": item.get("human_verified", False),
                    "unscored_fields": item.get("unscored_fields", []),
                    "category": item.get(
                        "catalog_category", item.get("catalog_category_hint", "")
                    ),
                }
            )
        # Content-addressed dataset IDs make repeated imports idempotent and preserve prior snapshots.
        digest = hashlib.sha256(
            json.dumps(normalized, sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()
        datasets.append(
            {
                "id": source + "-" + digest[:16],
                "workspace_id": source,
                "name": source + " · 원본 레이블 v1",
                "created_at": s.now(),
                "fingerprint": digest,
                "rows": normalized,
                "kind": "import",
                "provenance": "AI 검토 레이블"
                if source == "musinsa"
                else "모델 의사 레이블",
                "parent_ids": [],
            }
        )
    with s.db() as c:
        c.execute("BEGIN IMMEDIATE")
        for d in datasets:
            try:
                existing = s.get("dataset", d["id"], c)
                result.append(s.public_dataset(existing))
                continue
            except KeyError:
                pass
            wid = d["workspace_id"]
            try:
                s.get("workspace", wid, c)
            except KeyError:
                s.save(
                    "workspace",
                    {
                        "id": wid,
                        "name": "무신사 · BKAVE" if wid == "musinsa" else "GS SHOP",
                        "description": d["provenance"],
                        "task": "attribute_extraction",
                        "created_at": s.now(),
                    },
                    c,
                )
            s.save("dataset", d, c)
            result.append(s.public_dataset(d))
    return result


if __name__ == "__main__":
    initialize()
    print(json.dumps(import_labeled(), ensure_ascii=False, indent=2))
