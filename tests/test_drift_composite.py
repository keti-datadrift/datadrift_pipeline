import copy
import hashlib

import numpy as np
import pytest
from PIL import Image

from backend.drift.detection import detect, holm
from backend.drift.images import MAX_SAMPLES, mmd_test, prepare
from backend.schemas import taxonomy as t


@pytest.fixture
def domains(tmp_path):
    def make(prefix, fit="레귤러핏", count=60, category="상의"):
        result = []
        for index in range(count):
            # Distinct content IDs avoid pseudo replication in the tests.
            path = tmp_path / f"{prefix}-{index}.png"
            Image.new("RGB", (8, 8), (index, 100 if prefix == "a" else 101, 30)).save(
                path
            )
            result.append(
                {
                    "id": f"{prefix}-{index}",
                    "image": str(path),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "schema_id": t.CURRENT,
                    "category": category,
                    "target": {"fit": fit},
                    "unscored_fields": [],
                }
            )
        return result

    return make


def features(rows, cache, report):
    # Same fixed feature distribution on both sides, independent of file names.
    vectors = np.array([[1.0, (int(r["id"].split("-")[-1]) % 10) / 10] for r in rows])
    return vectors, {"encoder": "fixture", "device": "cpu", "dimensions": 2}


def test_same_distribution_does_not_trigger_any_channel(domains):
    result = detect(domains("a"), domains("b"), 0.1, embed=features)
    assert result["decision"] == "not_detected" and result["complete"]
    assert not result["detected"]
    assert result["image_embeddings"]["adjusted_p_value"] == 1
    assert not any(signal["detected"] for signal in result["signals"])


def test_attribute_only_change_survives_global_correction(domains):
    result = detect(domains("a"), domains("b", "오버핏"), 0.1, embed=features)
    fit = result["fields"][0]
    assert fit["detected"] and fit["category_detected"]
    assert fit["adjusted_p_value"] <= 0.05
    assert result["decision"] == "detected"
    assert not result["image_embeddings"]["detected"]


def test_image_only_shift_detected_even_with_identical_labels(domains):
    def shifted(rows, cache, report):
        return np.array(
            [[1, 0] if r["id"].startswith("a-") else [0, 1] for r in rows]
        ), {"encoder": "fixture"}

    result = detect(domains("a"), domains("b"), 0.1, embed=shifted)
    assert result["image_embeddings"]["detected"]
    assert not any(field["detected"] for field in result["fields"])
    assert result["detected"]


def test_small_samples_are_not_reported_as_normal(domains):
    result = detect(
        domains("a", count=5),
        domains("b", count=5),
        0.1,
        embed=lambda *args: pytest.fail("Too few independent images"),
    )
    assert result["decision"] == "insufficient"
    assert not result["complete"] and not result["detected"]
    assert result["image_embeddings"]["status"] == "insufficient"
    assert result["fields"][0]["status"] == "insufficient"


def test_exact_same_inputs_skip_encoder_and_have_no_drift(domains):
    rows = domains("a", count=5)
    result = detect(
        rows,
        copy.deepcopy(rows),
        0.1,
        embed=lambda *args: pytest.fail("Identical images need no encoder"),
    )
    assert result["decision"] == "not_detected"
    assert result["image_embeddings"]["status"] == "identical"
    assert result["quality"]["shared_images"] == 5


def test_overlapping_and_duplicate_images_are_not_independent_samples(domains):
    a, b = domains("a", count=25), domains("b", count=25)
    result = detect(
        a + a,
        a + b[:10],
        0.1,
        embed=lambda *args: pytest.fail("Shared reference leaves no test population"),
    )
    assert result["decision"] == "insufficient"
    assert result["quality"]["shared_images"] == 25
    assert result["quality"]["reference_duplicates"] == 25
    assert result["analysis_reference_count"] == 0


def test_category_mix_changes_but_within_category_does_not(domains):
    a = domains("a", count=80)
    b = domains("b", count=80)
    for i, row in enumerate(a):
        row.update(
            category="상의" if i < 60 else "하의",
            target={"fit": "레귤러핏" if i < 60 else "슬림"},
        )
    for i, row in enumerate(b):
        row.update(
            category="상의" if i < 20 else "하의",
            target={"fit": "레귤러핏" if i < 20 else "슬림"},
        )
    result = detect(a, b, 0.05, embed=features)
    assert result["category_mix"]["detected"]
    assert result["fields"][0]["detected"]
    assert not result["fields"][0]["category_detected"]


def test_mmd_permutations_seed_and_holm_family():
    rng = np.random.default_rng(3)
    x, y = rng.normal(size=(30, 12)), rng.normal(size=(30, 12))
    assert mmd_test(x, y, repeats=99) == mmd_test(x, y, repeats=99)
    tests = [{"p_value": 0.01}, {"p_value": 0.03}, {"p_value": 0.9}]
    holm(tests)
    assert [round(t["adjusted_p_value"], 2) for t in tests] == [0.03, 0.06, 0.9]
    with pytest.raises(ValueError):
        mmd_test(np.full((20, 2), np.nan), np.ones((20, 2)))


def test_bounded_sampling_is_stable_and_keeps_full_statistical_population():
    a = [{"sha256": f"a{i:04d}", "image": str(i)} for i in range(600)]
    b = [{"sha256": f"b{i:04d}", "image": str(i)} for i in range(600)]
    first = prepare(a, b)
    assert len(first["reference"]) == 600
    assert len(first["image_reference"]) == MAX_SAMPLES
    assert first == prepare(list(reversed(a)), list(reversed(b)))


def test_unlabeled_matching_schema_can_use_image_drift(client):
    from backend.data import store as s

    a = s.get("dataset", "d")
    for row in a["rows"]:
        row.update(label_state="unlabeled", target={})
    s.save("dataset", a)
    s.save("dataset", a | {"id": "other", "fingerprint": "other"})
    response = client.post(
        "/api/jobs", json={"kind": "drift", "dataset_id": "d", "reference_id": "other"}
    )
    assert response.status_code == 201, response.text


def test_unknown_category_is_not_a_category_stratum(domains):
    a, b = domains("a"), domains("b")
    for row in a + b:
        row["category"] = None
    result = detect(a, b, 0.1, embed=features)
    assert (
        next(s for s in result["signals"] if s["kind"] == "within_category")["status"]
        == "insufficient"
    )
    assert result["category_mix"]["status"] == "insufficient"
    assert "category_adjusted_p_value" not in result["fields"][0]
