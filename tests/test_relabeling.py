import copy
import json
from backend import taxonomy as t, store as s
from backend.relabeling import convert, prompt
from backend.drift_statistics import analyze


def sample(i=0, fit="레귤러핏", category="상의"):
    target = {
        k: ([] if k == "details" else v[0])
        for k, v in t.schema(t.CURRENT, category).items()
    }
    target["fit"] = fit
    return {
        "id": str(i),
        "category": category,
        "target": target,
        "label_source": "old AI",
        "unscored_fields": [],
        "human_verified": True,
        "schema_id": t.CURRENT,
    }


def test_teacher_does_not_receive_old_labels_and_preserves_provenance():
    old = sample()
    old["target"]["fit"] = "OLD_VALUE_MUST_NOT_LEAK"
    before = copy.deepcopy(old)
    assert "OLD_VALUE_MUST_NOT_LEAK" not in prompt(old)
    pred = sample(fit="루즈핏")["target"]
    pred.update(origin="국내", color_code="BK", details=["로고/그래픽"])
    changed = convert(old, json.dumps(pred), {"created_at": "now", "model": "teacher"})
    assert old == before
    assert changed["target"]["fit"] == "루즈핏"
    assert changed["target"]["origin"] == changed["target"]["color_code"] == "unknown"
    assert set(changed["unscored_fields"]) >= {"details", "origin", "color_code"}
    assert changed["ai_label"]["rejected_fields"]["details"] == ["로고/그래픽"]
    assert changed["label_history"][-1]["before"]["target"] == before["target"]
    assert not changed["human_verified"]
    assert t.valid(changed["target"], t.CURRENT, "상의")
    broken = convert(old, "not JSON", {"created_at": "now"})
    assert set(broken["unscored_fields"]) == set(t.FIELDS)
    assert broken["target"]["fit"] == "unknown"
    fenced = convert(
        old,
        "```json\n" + json.dumps(sample()["target"]) + "\n```",
        {"created_at": "now"},
    )
    assert fenced["ai_label"]["schema_valid"]


def test_permutation_detects_change_and_category_composition_control():
    a = [sample(i, "레귤러핏") for i in range(80)]
    b = [sample(i, "오버핏") for i in range(80)]
    report = analyze(a, b, repeats=199)
    fit = next(f for f in report["fields"] if f["field"] == "fit")
    assert fit["js_divergence"] == 1
    assert fit["q_value"] < 0.05
    assert fit["category_adjusted_q"] < 0.05
    same = next(f for f in analyze(a, a, repeats=199)["fields"] if f["field"] == "fit")
    assert same["js_divergence"] == 0 and same["p_value"] == 1
    # Apparent fit shift entirely due to category mixture: strata themselves equal.
    lower = [sample(i, "슬림", "하의") for i in range(80)]
    mix = analyze(a + lower[:10], a[:10] + lower, repeats=199)
    fit = next(f for f in mix["fields"] if f["field"] == "fit")
    assert fit["js_divergence"] > 0.1
    assert fit["category_adjusted_js"] == 0
    assert fit["category_adjusted_q"] == 1


def test_labeling_job_validation_and_cancel(client, tmp_path, monkeypatch):
    from backend import relabeling

    monkeypatch.setattr(relabeling, "TEACHER", tmp_path)
    (tmp_path / "config.json").write_text("{}")
    assert (
        client.post(
            "/api/jobs", json={"kind": "labeling", "dataset_id": "d"}
        ).status_code
        == 422
    )
    dataset = s.get("dataset", "d")
    dataset.update(schema_id=t.CURRENT)
    s.save("dataset", dataset)
    assert (
        client.post(
            "/api/jobs",
            json={"kind": "labeling", "dataset_id": "d", "model_id": "qwen35_2b"},
        ).status_code
        == 422
    )
    response = client.post("/api/jobs", json={"kind": "labeling", "dataset_id": "d"})
    assert response.status_code == 201
    job = response.json()
    assert client.get("/api/jobs?kind=labeling").json()[0]["id"] == job["id"]
    assert (
        client.post("/api/jobs/" + job["id"] + "/cancel").json()["status"]
        == "cancelled"
    )
    assert s.get("dataset", "d") == dataset


def test_balanced_evaluation_is_reproducible_and_never_adds_rows():
    from backend.training import evaluation_rows

    rows = [{"id": str(i), "source": "a" if i < 70 else "b"} for i in range(100)]
    chosen = evaluation_rows(rows, 64, 42, "source_balanced")
    assert len(chosen) == len({r["id"] for r in chosen}) == 64
    assert sum(r["source"] == "b" for r in chosen) == 30
    assert chosen == evaluation_rows(rows, 64, 42, "source_balanced")
    assert len(evaluation_rows(rows, 200, 42, "source_balanced")) == 100


def test_paired_interval_matches_shared_image_differences():
    from scripts.summarize_relabel_drift import paired_interval

    before = {str(i): 0.5 for i in range(20)}
    after = {str(i): 0.75 for i in range(20)}
    result = paired_interval(before, after, list(before))
    assert result == {"count": 20, "difference": 0.25, "ci95": [0.25, 0.25]}
    result = paired_interval(before, before, list(before))
    assert result["difference"] == 0 and result["ci95"] == [0, 0]


def test_experiment_reports_running_evaluation_before_queued_training(client):
    report = {
        "status": "training_and_evaluation",
        "jobs": {
            "qwen35_4b_before": "eval-active",
            "qwen35_2b_mixed_train": "train-waiting",
        },
        "active_job": {
            "key": "qwen35_2b_mixed_train",
            "status": "queued",
            "progress": {},
        },
    }
    path = s.ROOT / "relabel-drift-experiment.json"
    path.write_text(json.dumps(report))
    s.save(
        "job",
        {
            "id": "eval-active",
            "status": "running",
            "progress": {"step": 17, "total": 64},
        },
    )
    actual = client.get("/api/experiments/relabel-drift").json()
    assert actual["active_job"]["key"] == "qwen35_4b_before"
    assert actual["active_job"]["progress"]["step"] == 17
    assert json.loads(path.read_text()) == report
