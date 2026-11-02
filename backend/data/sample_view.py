"""Image metadata and label provenance for the review screen."""

from pathlib import PurePosixPath

# Display aliases for imported labels; stored provenance is unchanged.
INITIAL_MODEL_NAMES = {
    "Codex primary agent, direct visual inspection": "GPT-Astra",
    "Gemma4 E2B initial LoRA image-only pseudo label, not human gold": "GPT-Astra",
}


def public_sample(row):
    result = {key: value for key, value in row.items() if key != "image"}
    path = row.get("upload_filename") or row.get("image") or row["product_id"]
    result["filename"] = PurePosixPath(str(path).replace("\\", "/")).name
    history = row.get("label_history", [])
    source = (
        row.get("original_label_source")
        or (history[0].get("before", {}).get("label_source") if history else None)
        or row.get("label_source")
    )
    initial_model = INITIAL_MODEL_NAMES.get(source)
    if initial_model:
        result["initial_label"] = {
            "model_name": initial_model,
            "at": row.get("initial_labeled_at"),
        }
    result["ai_labeled"] = row.get("label_state") != "unlabeled" and bool(
        initial_model
        or row.get("ai_label")
        or any(entry.get("channel") == "ai_relabel" for entry in history)
    )
    return result
