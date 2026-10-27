import pytest
from fastapi.testclient import TestClient
from backend import store as s
from backend.api import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(s, "ROOT", tmp_path / "state")
    monkeypatch.setenv("DATADRIFT_MODELS", str(tmp_path / "models"))
    (tmp_path / "models/Qwen3.5-2B").mkdir(parents=True)
    with TestClient(app) as client:
        s.save("workspace", {"id": "w", "name": "test", "task": "attribute_extraction"})
        rows = []
        for i in range(12):
            rows.append(
                {
                    "id": str(i),
                    "product_id": str(i),
                    "sha256": str(i),
                    "source": "musinsa" if i < 6 else "gsshop",
                    "split": "train"
                    if i % 6 < 4
                    else "validation"
                    if i % 6 == 4
                    else "test",
                    "target": {"fit": "레귤러"},
                    "image": str(tmp_path / "image.jpg"),
                }
            )
        s.save(
            "dataset",
            {
                "id": "d",
                "workspace_id": "w",
                "name": "fixture",
                "fingerprint": "abc",
                "rows": rows,
            },
        )
        yield client
