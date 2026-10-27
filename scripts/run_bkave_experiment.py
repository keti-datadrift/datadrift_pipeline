"""Submit durable worker jobs, then evaluate both trained adapters on identical held-out rows."""

import json
import time
import urllib.request
from pathlib import Path
from backend import taxonomy as t

BASE = "http://127.0.0.1:18092/api"
REPORT = Path(".runtime/bkave-experiment.json")


def api(path, body=None, method=None):
    request = urllib.request.Request(
        BASE + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=30) as r:
        return json.load(r)


def save(report):
    tmp = REPORT.with_suffix(".tmp")
    tmp.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    tmp.replace(REPORT)


def main():
    if REPORT.exists():
        report = json.loads(REPORT.read_text())
        assert report["schema_id"] == t.CURRENT
    else:
        datasets = api("/datasets")
        original_ids = {d["id"] for d in datasets if d["kind"] == "import"}
        parents = [
            d
            for d in datasets
            if d.get("schema_id") == t.CURRENT
            and d["kind"] == "taxonomy_migration"
            and set(d["parent_ids"]) <= original_ids
        ]
        assert len(parents) == 2 and sum(d["count"] for d in parents) == 1651
        dataset = api(
            "/reconstructions",
            {
                "workspace_id": "musinsa",
                "name": "비케이브 · 무신사+GS SHOP · 학습 1190",
                "dataset_ids": [d["id"] for d in parents],
                "train_budget": 1190,
                "seed": 42,
                "method": "source_balanced",
            },
        )
        assert dataset["splits"] == {"train": 1190, "validation": 181, "test": 280}
        report = {
            "schema_id": t.CURRENT,
            "dataset_id": dataset["id"],
            "splits": dataset["splits"],
            "models": {},
            "started_at": time.time(),
        }
        save(report)
    for family in ["qwen35_2b", "qwen35_4b"]:
        if family not in report["models"]:
            job = api(
                "/jobs",
                {
                    "kind": "training",
                    "dataset_id": report["dataset_id"],
                    "model_id": family,
                    "max_steps": 100,
                    "learning_rate": 2e-5,
                    "seed": 42,
                },
            )
            report["models"][family] = {"training_id": job["id"]}
            save(report)
    last = {}
    while True:
        complete = True
        for family, item in report["models"].items():
            train = api("/jobs/" + item["training_id"])
            status = (train["status"], train["progress"].get("step", 0) // 10)
            if last.get(family) != status:
                print(
                    family,
                    train["status"],
                    train["progress"].get("step"),
                    train.get("error"),
                    flush=True,
                )
                last[family] = status
            if train["status"] in ("failed", "cancelled"):
                item["error"] = train.get("error") or "작업이 취소되었습니다."
                save(report)
                raise RuntimeError(family + ": " + item["error"])
            if train["status"] != "succeeded":
                complete = False
                continue
            if "evaluation_id" not in item:
                item["model_id"] = train["result"]["model_id"]
                api(
                    "/models/" + item["model_id"],
                    {
                        "name": (
                            "Qwen3.5-2B" if family.endswith("2b") else "Qwen3.5-4B"
                        )
                        + " · 비케이브 · 100step"
                    },
                    "PATCH",
                )
                evaluation = api(
                    "/jobs",
                    {
                        "kind": "evaluation",
                        "dataset_id": report["dataset_id"],
                        "model_id": item["model_id"],
                        "sample_limit": 32,
                        "split": "validation",
                        "seed": 42,
                    },
                )
                item["evaluation_id"] = evaluation["id"]
                save(report)
            evaluation = api("/jobs/" + item["evaluation_id"])
            if evaluation["status"] in ("failed", "cancelled"):
                item["error"] = evaluation.get("error") or "평가가 취소되었습니다."
                save(report)
                raise RuntimeError(family + " evaluation: " + item["error"])
            if evaluation["status"] != "succeeded":
                complete = False
                continue
            item["result"] = {
                k: evaluation["result"][k]
                for k in [
                    "count",
                    "macro_attribute_accuracy",
                    "exact_match",
                    "parse_failures",
                    "schema_failures",
                    "by_source",
                ]
            }
            item["training_result"] = {
                k: train["result"][k]
                for k in [
                    "optimizer_steps",
                    "policy_changed",
                    "loss",
                    "elapsed_seconds",
                ]
            }
            save(report)
        if complete:
            break
        time.sleep(10)
    report["status"] = "passed"
    report["finished_at"] = time.time()
    save(report)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
