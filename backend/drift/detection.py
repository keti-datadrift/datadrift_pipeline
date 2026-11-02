"""Composite domain drift: attributes, category mix, and fixed image embeddings."""

from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from backend.data import store as s
from backend.drift.images import (
    MIN_SAMPLES,
    PERMUTATIONS,
    mmd_test,
    prepare,
    sample_fingerprint,
)
from backend.drift.statistics import analyze, test_counts
from backend.schemas import taxonomy

ALPHA = 0.05


def js(a, b):
    keys = sorted(set(a) | set(b))
    p = np.array([a.get(k, 0) for k in keys], dtype=float)
    q = np.array([b.get(k, 0) for k in keys], dtype=float)
    if not p.sum() or not q.sum():
        return 0.0
    p /= p.sum()
    q /= q.sum()
    m = (p + q) / 2

    def kl(x):
        mask = x > 0
        return float(np.sum(x[mask] * np.log2(x[mask] / m[mask])))

    return (kl(p) + kl(q)) / 2


def histogram(rows):
    counts = np.zeros(24, dtype=float)
    for row in rows:
        with Image.open(row["image"]) as im:
            pixels = np.asarray(
                ImageOps.exif_transpose(im).convert("RGB").resize((32, 32))
            )
        for channel in range(3):
            counts[channel * 8 : (channel + 1) * 8] += np.histogram(
                pixels[:, :, channel], bins=8, range=(0, 256)
            )[0]
    return {str(i): float(n) for i, n in enumerate(counts)}


def holm(tests):
    """Familywise correction across every attribute, stratum, category and MMD test."""
    previous = 0.0
    ordered = sorted(tests, key=lambda test: test["p_value"])
    for rank, test in enumerate(ordered):
        previous = max(previous, min(1.0, test["p_value"] * (len(ordered) - rank)))
        test["adjusted_p_value"] = previous


def detect(
    reference, current, threshold, *, seed=42, report=None, embed=None, cache=None
):
    if not reference or not current:
        raise ValueError("비교할 이미지가 없습니다.")
    report = report or (lambda *args: None)
    report("preparing_drift", 0, len(reference) + len(current))
    plan = prepare(reference, current, seed)
    a, b = plan["reference"], plan["current"]
    identical = plan["identical_inputs"]
    # Exact equality needs no inferential test, including small identical datasets.
    if identical:
        a, b = (
            list({r.get("sha256") or r["image"]: r for r in reference}.values()),
            list({r.get("sha256") or r["image"]: r for r in current}.values()),
        )
    statistics = (
        analyze(a, b, seed=seed, min_category_samples=MIN_SAMPLES)
        if a and b
        else {"fields": []}
    )
    by_field = {v["field"]: v for v in statistics["fields"]}
    fields, tests = [], []
    schema_id = reference[0].get("schema_id", taxonomy.LEGACY)
    for field in taxonomy.schema(schema_id):

        def counts(rows, field=field):
            result = Counter()
            for row in rows:
                if row.get("label_state") == "unlabeled" or field in row.get(
                    "unscored_fields", []
                ):
                    continue
                value = row["target"].get(field)
                if value in (None, "unknown", "not_applicable"):
                    continue
                result[str(sorted(value) if isinstance(value, list) else value)] += 1
            return result

        x, y = counts(a), counts(b)
        if not x and not y:
            continue
        detail = by_field.get(field, {})
        tested = min(sum(x.values()), sum(y.values())) >= MIN_SAMPLES or identical
        item = {
            **detail,
            "field": field,
            "js_divergence": js(x, y),
            "reference": dict(x),
            "current": dict(y),
            "detected": False,
            "status": "tested" if tested and x and y else "insufficient",
        }
        if item["status"] == "tested":
            tests.append(
                {
                    "kind": "attribute",
                    "field": field,
                    "p_value": detail.get("p_value", 1.0),
                    "effect": item["js_divergence"],
                }
            )
        if detail.get("category_adjusted_p") is not None:
            tests.append(
                {
                    "kind": "within_category",
                    "field": field,
                    "p_value": detail["category_adjusted_p"],
                    "effect": detail["category_adjusted_js"],
                }
            )
        fields.append(item)
    category = {"status": "insufficient", "detected": False}
    x, y = (
        Counter(
            taxonomy.category(r.get("category"))
            for r in rows
            if taxonomy.category(r.get("category")) in taxonomy.CATEGORIES
        )
        for rows in (a, b)
    )
    if x or y:
        category.update(
            reference=dict(x),
            current=dict(y),
            js_divergence=js(x, y),
            reference_count=sum(x.values()),
            current_count=sum(y.values()),
        )
    if min(sum(x.values()), sum(y.values())) >= MIN_SAMPLES or (identical and x and y):
        observed, null = test_counts(x, y, np.random.default_rng(seed), PERMUTATIONS)
        category.update(
            status="tested",
            p_value=float((1 + np.sum(null >= observed - 1e-12)) / (PERMUTATIONS + 1)),
        )
        tests.append(
            {
                "kind": "category_mix",
                "p_value": category["p_value"],
                "effect": category["js_divergence"],
            }
        )
    report("testing_attributes", 1, 1)
    image_a, image_b = plan["image_reference"], plan["image_current"]
    if identical:
        image = {
            "status": "identical",
            "statistic": 0.0,
            "p_value": 1.0,
            "reference_count": len(a),
            "current_count": len(b),
            "detected": False,
        }
    elif min(len(image_a), len(image_b)) < MIN_SAMPLES:
        image = {
            "status": "insufficient",
            "reference_count": len(image_a),
            "current_count": len(image_b),
            "reason": f"공유·중복 이미지를 제외하고 각 {MIN_SAMPLES}장 이상 필요합니다.",
            "detected": False,
        }
    else:
        if embed is None:
            from backend.drift.embeddings import extract

            embed = extract
        vectors, encoder = embed(
            image_a + image_b, Path(cache or s.ROOT / "image-features"), report
        )
        if len(vectors) != len(image_a) + len(image_b):
            raise ValueError("이미지 특징 추출 결과가 입력 개수와 다릅니다.")
        image = (
            mmd_test(
                vectors[: len(image_a)],
                vectors[len(image_a) :],
                seed=seed,
                report=report,
            )
            | encoder
        )
        image.update(
            reference_sample_sha256=sample_fingerprint(image_a),
            current_sample_sha256=sample_fingerprint(image_b),
            detected=False,
        )
        tests.append(
            {
                "kind": "image_embeddings",
                "p_value": image["p_value"],
                "effect": image["statistic"],
            }
        )
    holm(tests)
    field_map = {f["field"]: f for f in fields}
    for test in tests:
        found = test["adjusted_p_value"] <= ALPHA and (
            test["kind"] == "image_embeddings" or test["effect"] >= threshold
        )
        test["detected"] = bool(found)
        if test["kind"] == "attribute":
            field_map[test["field"]].update(
                adjusted_p_value=test["adjusted_p_value"], detected=bool(found)
            )
        elif test["kind"] == "within_category":
            field_map[test["field"]].update(
                category_adjusted_p_value=test["adjusted_p_value"],
                category_detected=bool(found),
            )
        elif test["kind"] == "category_mix":
            category.update(
                adjusted_p_value=test["adjusted_p_value"], detected=bool(found)
            )
        else:
            image.update(
                adjusted_p_value=test["adjusted_p_value"], detected=bool(found)
            )
    signals = []
    for kind in ("attribute", "within_category", "category_mix", "image_embeddings"):
        candidates = [test for test in tests if test["kind"] == kind]
        valid = bool(candidates) or identical
        signals.append(
            {
                "kind": kind,
                "status": "tested" if valid else "insufficient",
                "detected": any(test["detected"] for test in candidates),
                "tested_count": len(candidates),
                "detected_count": sum(test["detected"] for test in candidates),
            }
        )
    detected = any(signal["detected"] for signal in signals)
    complete = identical or (
        image["status"] == "tested" and any(f["status"] == "tested" for f in fields)
    )
    decision = (
        "detected" if detected else "not_detected" if complete else "insufficient"
    )
    report("finishing_drift", 1, 1)
    return {
        "method_version": "composite-v1",
        "comparison": "source/domain",
        "decision": decision,
        "detected": detected,
        "complete": bool(complete),
        "signals": signals,
        "reference_count": len(reference),
        "current_count": len(current),
        "analysis_reference_count": len(a),
        "analysis_current_count": len(b),
        "threshold": threshold,
        "alpha": ALPHA,
        "seed": seed,
        "fields": sorted(fields, key=lambda f: f["js_divergence"], reverse=True),
        "statistics": statistics,
        "category_mix": category,
        "image_embeddings": image,
        "correction": {"method": "Holm", "test_count": len(tests), "alpha": ALPHA},
        "quality": {
            k: plan[k]
            for k in (
                "shared_images",
                "reference_duplicates",
                "current_duplicates",
                "identical_inputs",
            )
        },
        "image_histogram_js": js(histogram(reference), histogram(current)),
        "note": "속성·카테고리는 JS 변화량과 보정 유의확률, 이미지 특징은 MMD 검정으로 판정합니다. 공유·중복 이미지는 독립 표본 검정에서 제외합니다. 분포 변화가 모델 성능 저하를 의미하지는 않습니다.",
    }
