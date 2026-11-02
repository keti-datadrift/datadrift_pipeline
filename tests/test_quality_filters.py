from backend.data import store as s


def test_review_counts_and_drift_filter_exclude_unscored(client):
    d = s.get("dataset", "d")
    d["rows"][0].update(human_verified=True)
    d["rows"][1].update(label_state="unlabeled")
    d["rows"][2].update(unscored_fields=["fit"])
    d["rows"][3]["target"]["fit"] = ["B", "A"]
    s.save("dataset", d)
    summary = client.get("/api/datasets/d").json()
    assert summary["reviewed_count"] == 1 and summary["unlabeled_count"] == 1
    assert s.public_dataset(d)["reviewed_count"] == 1
    assert client.get("/api/datasets/d/samples?review=verified").json()["total"] == 1
    assert client.get("/api/datasets/d/samples?review=pending").json()["total"] == 10
    assert client.get("/api/datasets/d/samples?review=unlabeled").json()["total"] == 1
    response = client.get(
        "/api/datasets/d/samples", params={"attribute": "fit", "value": "['A', 'B']"}
    )
    assert response.json()["total"] == 1
    response = client.get(
        "/api/datasets/d/samples", params={"attribute": "fit", "value": "레귤러"}
    )
    assert "2" not in [r["id"] for r in response.json()["items"]]


def test_jobs_keep_dataset_display_name_when_collection_changes(client):
    s.save(
        "job",
        {
            "id": "j",
            "request": {"kind": "drift", "dataset_id": "d", "reference_id": "d"},
        },
    )
    result = client.get("/api/jobs?summary=true").json()[0]
    assert result["dataset_name"] == "test"
    assert result["dataset_workspace_id"] == "w"
    assert result["reference_name"] == "test"
