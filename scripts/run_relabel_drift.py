"""Frozen protocol: independent AI relabeling, equal-budget retraining and domain probes.

Run from repo root with PYTHONPATH=. No test labels enter training; no outcome-based
checkpoint selection. Reuses durable job IDs from an atomic report on restart.
"""

import copy
import hashlib
import json
import random
import time
from collections import Counter
from backend import store as s, taxonomy as t
from backend.drift_statistics import analyze
from scripts.run_bkave_experiment import api

REPORT = s.ROOT / "relabel-drift-experiment.json"
PARENT = "a8bce868093c4d8985403552a73ce099"
OLD = {
    "qwen35_2b": "trained-dc51670a8a0840719ff197f1999e1d6f",
    "qwen35_4b": "trained-355c789b1c2a4f5ba0ee6edeae01e166",
}


def save(report):
    report["updated_at"] = s.now()
    tmp = REPORT.with_suffix(".tmp")
    tmp.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    tmp.replace(REPORT)


def submit(report, key, body):
    if key not in report["jobs"]:
        report["jobs"][key] = api("/jobs", body)["id"]
        save(report)
    return report["jobs"][key]


def wait(report, key):
    previous = None
    while True:
        job = api("/jobs/" + report["jobs"][key])
        state = (job["status"], job["progress"].get("step", 0) // 20)
        report["active_job"] = {
            "key": key,
            "id": job["id"],
            "status": job["status"],
            "progress": job["progress"],
        }
        save(report)
        if state != previous:
            print(key, state, flush=True)
            previous = state
        if job["status"] == "succeeded":
            return job
        if job["status"] in ("failed", "cancelled"):
            raise RuntimeError(key + ": " + str(job.get("error") or job["status"]))
        time.sleep(10)


def source_versions(report, mixed):
    sources = {}
    for source in ["musinsa", "gsshop"]:
        did = mixed["id"] + "-" + source
        try:
            dataset = s.get("dataset", did)
        except KeyError:
            rows = [r for r in mixed["rows"] if r["source"] == source]
            dataset = copy.deepcopy(mixed)
            dataset.update(
                id=did,
                name=("무신사" if source == "musinsa" else "GS SHOP")
                + " · 비케이브 AI 재레이블",
                workspace_id=source,
                parent_ids=[mixed["id"]],
                rows=rows,
                created_at=s.now(),
                fingerprint=hashlib.sha256(
                    json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()
                ).hexdigest(),
                label_coverage=dict(
                    Counter(
                        k
                        for r in rows
                        for k in t.FIELDS
                        if k not in r["unscored_fields"]
                    )
                ),
            )
            s.save("dataset", dataset)
        sources[source] = did
    report["source_datasets"] = sources
    save(report)
    return sources


def evaluate(report, key, model, dataset):
    submit(
        report,
        key,
        {
            "kind": "evaluation",
            "dataset_id": dataset,
            "model_id": model,
            "sample_limit": 64,
            "split": "validation",
            "seed": 42,
            "sampling": "source_balanced",
        },
    )


def run(report):
    submit(report, "labeling", {"kind": "labeling", "dataset_id": PARENT})
    label = wait(report, "labeling")
    report["labeling"] = label["result"]
    mixed = s.get("dataset", label["result"]["dataset_id"])
    assert len(mixed["rows"]) == 1651
    assert label["result"]["parse_failures"] / 1651 <= 0.05, (
        "Teacher parsing failure rate exceeds 5%; review raw outputs"
    )
    report["dataset_id"] = mixed["id"]
    sources = source_versions(report, mixed)
    report["status"] = "training_and_evaluation"
    save(report)
    # Freeze pre/post comparison on the same new teacher labels, never compare scores from different references.
    for family, old in OLD.items():
        evaluate(report, family + "_before", old, mixed["id"])
    for family in OLD:
        submit(
            report,
            family + "_mixed_train",
            {
                "kind": "training",
                "dataset_id": mixed["id"],
                "model_id": family,
                "max_steps": 100,
                "seed": 42,
                "learning_rate": 2e-5,
            },
        )
    # Additional equal-budget source-only 4B control, to separate source adaptation from relabeling.
    submit(
        report,
        "qwen35_4b_source_train",
        {
            "kind": "training",
            "dataset_id": sources["musinsa"],
            "model_id": "qwen35_4b",
            "max_steps": 100,
            "seed": 42,
            "learning_rate": 2e-5,
        },
    )
    submit(
        report,
        "drift",
        {
            "kind": "drift",
            "dataset_id": sources["gsshop"],
            "reference_id": sources["musinsa"],
            "threshold": 0.1,
        },
    )
    for key in [f + "_mixed" for f in OLD] + ["qwen35_4b_source"]:
        trained = wait(report, key + "_train")
        mid = trained["result"]["model_id"]
        name = (
            ("Qwen3.5-2B" if "2b" in key else "Qwen3.5-4B")
            + " · AI 재레이블 · "
            + ("무신사만" if key.endswith("source") else "혼합")
            + " · 100step"
        )
        api("/models/" + mid, {"name": name}, "PATCH")
        evaluate(report, key + "_after", mid, mixed["id"])
    comparisons = []
    eval_ids = None
    for key in (
        [f + "_before" for f in OLD]
        + [f + "_mixed_after" for f in OLD]
        + ["qwen35_4b_source_after"]
    ):
        job = wait(report, key)
        result = job["result"]
        ids = {p["sample_id"] for p in result["predictions"]}
        assert len(ids) == 64
        assert Counter(p["source"] for p in result["predictions"]) == {
            "musinsa": 32,
            "gsshop": 32,
        }
        if eval_ids is None:
            eval_ids = ids
        assert ids == eval_ids
        model = s.get("model", job["request"]["model_id"])
        trained = s.get("job", model["training_job_id"])["result"]
        assert not ids.intersection(trained["training_sample_ids"])
        comparisons.append(
            {
                "key": key,
                "job_id": job["id"],
                "model_id": model["id"],
                "name": model["name"],
                "count": result["count"],
                "macro_attribute_accuracy": result["macro_attribute_accuracy"],
                "exact_match": result["exact_match"],
                "schema_failures": result["schema_failures"],
                "parse_failures": result["parse_failures"],
                "by_source": {
                    k: {
                        f: v[f]
                        for f in [
                            "count",
                            "macro_attribute_accuracy",
                            "exact_match",
                            "schema_failures",
                        ]
                    }
                    for k, v in result["by_source"].items()
                },
            }
        )
        report["comparisons"] = comparisons
        save(report)
    drift = wait(report, "drift")
    report["drift"] = {"job_id": drift["id"], **drift["result"]}
    # Same-source random halves are a negative control, fixed before observing the teacher outputs.
    controls = {}
    for source, did in sources.items():
        rows = s.get("dataset", did)["rows"].copy()
        random.Random(42).shuffle(rows)
        controls[source] = analyze(rows[: len(rows) // 2], rows[len(rows) // 2 :])
    report["same_source_controls"] = controls
    # Paired old/new label disagreement is annotation revision, never called temporal data drift.
    previous = {r["id"]: r for r in s.get("dataset", PARENT)["rows"]}
    report["label_changes"] = {
        field: {
            "changed": sum(
                r["target"][field] != previous[r["id"]]["target"][field]
                for r in mixed["rows"]
            ),
            "new_scored": sum(field not in r["unscored_fields"] for r in mixed["rows"]),
            "old_scored": sum(
                field not in previous[r["id"]]["unscored_fields"] for r in mixed["rows"]
            ),
        }
        for field in t.FIELDS
    }
    report.update(
        status="succeeded",
        finished_at=s.now(),
        active_job=None,
        note="동일 AI 교사 기준의 탐색적 비교입니다. 실제 시간 축이 없으므로 출처 간 드리프트 후보이며 사람 정답 정확도·시간 경과 성능 저하를 확정하지 않습니다.",
    )
    save(report)


def main():
    if REPORT.exists():
        report = json.loads(REPORT.read_text())
        if report["status"] == "succeeded":
            return
    else:
        report = {
            "status": "labeling",
            "created_at": s.now(),
            "jobs": {},
            "protocol": {
                "parent_dataset_id": PARENT,
                "schema_id": t.CURRENT,
                "teacher": "Gemma-4-12B base",
                "training_steps": 100,
                "seed": 42,
                "validation_per_source": 32,
                "arms": [
                    "previous 2B/4B adapters",
                    "fresh 2B/4B mixed-source 100 steps",
                    "fresh 4B Musinsa-only 100 steps",
                ],
                "drift_permutations": 999,
                "drift_threshold": 0.1,
                "category_min_per_source": 10,
                "negative_control": "seed42 random half split within each source",
                "nonvisual_fields": ["origin", "color_code"],
                "human_gold": False,
            },
        }
        save(report)
    try:
        run(report)
    except Exception as exc:
        report.update(status="failed", error=str(exc))
        save(report)
        raise


if __name__ == "__main__":
    main()
