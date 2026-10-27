"""Read completed frozen experiment results; summarize without changing model outputs."""

import json
from collections import Counter
import numpy as np
from PIL import Image
from backend import store as s, taxonomy as t
from scripts.run_relabel_drift import REPORT, save


def image_scores(job, rows):
    scores = {}
    for p in job["result"]["predictions"]:
        row = rows[p["sample_id"]]
        matches = []
        for f in t.FIELDS:
            truth = row["target"][f]
            if f in row["unscored_fields"] or truth in (
                None,
                "unknown",
                "not_applicable",
            ):
                continue
            actual = (p["prediction"] or {}).get(f)
            if isinstance(truth, list):
                match = isinstance(actual, list) and sorted(map(str, actual)) == sorted(
                    truth
                )
            else:
                match = actual == truth
            matches.append(int(match))
        if matches:
            scores[p["sample_id"]] = float(np.mean(matches))
    return scores


def paired_interval(before, after, ids, seed=42):
    delta = np.array([after[i] - before[i] for i in ids if i in before and i in after])
    rng = np.random.default_rng(seed)
    simulated = rng.choice(delta, (2000, len(delta)), replace=True).mean(axis=1)
    return {
        "count": len(delta),
        "difference": float(delta.mean()),
        "ci95": np.quantile(simulated, [0.025, 0.975]).tolist(),
    }


def main():
    report = json.loads(REPORT.read_text())
    assert report["status"] == "succeeded", "Experiment is not complete"
    dataset = s.get("dataset", report["dataset_id"])
    rows = {r["id"]: r for r in dataset["rows"]}
    assert len(rows) == len(dataset["rows"]) == 1651
    assert len({r["sha256"] for r in rows.values()}) == 1651
    split_hashes = {
        split: {r["sha256"] for r in rows.values() if r["split"] == split}
        for split in ["train", "validation", "test"]
    }
    assert not split_hashes["train"] & (
        split_hashes["validation"] | split_hashes["test"]
    )
    scores = {}
    training = {}
    eval_ids = None
    for item in report["comparisons"]:
        job = s.get("job", item["job_id"])
        ids = [p["sample_id"] for p in job["result"]["predictions"]]
        if eval_ids is None:
            eval_ids = ids
        assert ids == eval_ids
        scores[item["key"]] = image_scores(job, rows)
        model = s.get("model", item["model_id"])
        tr = s.get("job", model["training_job_id"])["result"]
        train_ids = tr["training_sample_ids"]
        assert tr["optimizer_steps"] == 100 and tr["policy_changed"]
        assert all(rows[i]["split"] == "train" for i in train_ids)
        assert not {rows[i]["sha256"] for i in ids} & {
            rows[i]["sha256"] for i in train_ids
        }
        training[item["key"]] = set(train_ids)
    assert training["qwen35_2b_mixed_after"] == training["qwen35_4b_mixed_after"]
    comparisons = {}
    for source in ["musinsa", "gsshop"]:
        ids = [i for i in eval_ids if rows[i]["source"] == source]
        for family in ["qwen35_2b", "qwen35_4b"]:
            comparisons[family + "_" + source + "_relabel_effect"] = paired_interval(
                scores[family + "_before"], scores[family + "_mixed_after"], ids
            )
        comparisons["qwen35_4b_" + source + "_mix_vs_source_only"] = paired_interval(
            scores["qwen35_4b_source_after"], scores["qwen35_4b_mixed_after"], ids
        )
    drift = report["drift"]["fields"]
    report["assessment"] = {
        "raw_candidates": [
            f["field"]
            for f in drift
            if f["js_divergence"] >= 0.1 and f.get("q_value", 1) < 0.05
        ],
        "within_category_candidates": [
            f["field"]
            for f in drift
            if f.get("category_adjusted_js", 0) >= 0.1
            and f.get("category_adjusted_q", 1) < 0.05
        ],
        "same_source_control_candidates": {
            source: [
                f["field"]
                for f in v["fields"]
                if f.get("js_divergence", 0) >= 0.1 and f.get("q_value", 1) < 0.05
            ]
            for source, v in report["same_source_controls"].items()
        },
        "paired_per_image_agreement": comparisons,
        "uncertainty_method": "2000 paired bootstrap resamples per source, seed42, percentile95%; per-image mean of scored fields (different from macro field metric in main table); exploratory, no human-label uncertainty correction",
        "audit": {
            "unique_images": 1651,
            "evaluation_images": 64,
            "validation_sources": dict(Counter(rows[i]["source"] for i in eval_ids)),
            "training_evaluation_overlap": 0,
            "training_images_equal_between_new_models": True,
            "old_and_new_mixed_training_ids_equal": training["qwen35_2b_before"]
            == training["qwen35_2b_mixed_after"],
            "all_models_100_steps": True,
        },
    }
    report["assessment"]["raw_candidate_names"] = [
        t.NAMES.get(k, k) for k in report["assessment"]["raw_candidates"]
    ]
    report["assessment"]["within_category_candidate_names"] = [
        t.NAMES.get(k, k) for k in report["assessment"]["within_category_candidates"]
    ]
    resolution = {}
    for source in ["musinsa", "gsshop"]:
        sizes = []
        for row in rows.values():
            if row["source"] == source:
                with Image.open(row["image"]) as image:
                    sizes.append(image.size)
        edges = np.array([max(width, height) for width, height in sizes])
        resolution[source] = {
            "count": len(sizes),
            "median_long_edge": float(np.median(edges)),
            "long_edge_min": int(edges.min()),
            "long_edge_max": int(edges.max()),
            "long_edge_at_most_160": int(np.sum(edges <= 160)),
            "categories": dict(
                Counter(
                    row["category"] for row in rows.values() if row["source"] == source
                )
            ),
        }
    report["assessment"]["image_resolution"] = resolution
    save(report)
    print(json.dumps(report["assessment"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
