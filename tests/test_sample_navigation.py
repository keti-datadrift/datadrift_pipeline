from backend.data import store as s


def test_ids_are_not_paginated_and_preserve_filters(client):
    expected = s.get("dataset", "d")["rows"]
    result = client.get("/api/datasets/d/samples?ids_only=true&limit=1&offset=2").json()
    assert result == {"total": len(expected), "ids": [r["id"] for r in expected]}
    result = client.get(
        "/api/datasets/d/samples?ids_only=true&split=train&q=레귤러"
    ).json()
    assert result["ids"] == [r["id"] for r in expected if r["split"] == "train"]
    assert "image" not in client.get("/api/datasets/d/samples/0").json()
    assert client.get("/api/datasets/d/samples/missing").status_code == 404
    assert client.get("/api/datasets/missing/samples/0").status_code == 404
