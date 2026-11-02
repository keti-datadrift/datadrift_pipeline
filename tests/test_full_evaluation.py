import json
from pathlib import Path

import pytest

from backend import worker
from backend.data import store as s
from backend.jobs import execution as job_execution
from backend.training import evaluation_rows


@pytest.mark.parametrize("split", ["test", "validation"])
@pytest.mark.parametrize("limit", [None, 3])
def test_full_evaluation_defaults_and_explicit_api_limit(
    client, monkeypatch, split, limit
):
    dataset = s.get("dataset", "d")
    original = dataset["rows"][0]
    dataset["rows"] = [
        original | {"id": f"{part}-{i}", "sha256": f"{part}-{i}", "split": part}
        for part, count in [("train", 30), ("test", 25), ("validation", 12)]
        for i in range(count)
    ]
    s.save("dataset", dataset)
    body = {
        "kind": "evaluation",
        "dataset_id": "d",
        "model_id": "qwen35_2b",
        "split": split,
    }
    if limit is not None:
        body["sample_limit"] = limit
    response = client.post("/api/jobs", json=body)
    assert response.status_code == 201, response.text
    job = response.json()
    assert job["request"]["sample_limit"] == limit
    available = 25 if split == "test" else 12
    expected = available if limit is None else limit

    class Process:
        returncode = 0

        def __init__(self, command, **kwargs):
            payload = json.loads(Path(command[-1]).read_text())
            assert len(payload["rows"]) == available
            assert all(row["split"] == split for row in payload["rows"])
            assert s.get("job", job["id"])["progress"]["total"] == expected
            rows = evaluation_rows(
                payload["rows"], payload["request"]["sample_limit"], 42
            )
            assert len(rows) == expected
            output = Path(payload["output"])
            (output / "progress.json").write_text(
                json.dumps(
                    {"phase": "completed", "step": len(rows), "total": len(rows)}
                )
            )
            (output / "result.json").write_text(
                json.dumps({"count": len(rows), "split": split})
            )

        def poll(self):
            return 0

    monkeypatch.setattr(job_execution.subprocess, "Popen", Process)
    worker.run(worker.claim())
    result = client.get("/api/jobs/" + job["id"]).json()
    assert result["status"] == "succeeded"
    assert result["result"]["count"] == expected
    assert s.get("dataset", "d") == dataset


@pytest.mark.parametrize("sampling", ["random", "source_balanced"])
def test_full_selection_keeps_every_image_once(sampling):
    rows = [{"id": str(i), "source": "old" if i < 23 else "new"} for i in range(29)]
    selected = evaluation_rows(rows, None, 42, sampling)
    assert len(selected) == len(rows)
    assert {row["id"] for row in selected} == {row["id"] for row in rows}
    assert selected == evaluation_rows(rows, None, 42, sampling)
