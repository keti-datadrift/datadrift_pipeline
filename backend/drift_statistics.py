"""Exploratory label distribution tests, including category-stratified controls."""

import json
from collections import Counter
import numpy as np
from . import taxonomy as t


def value(row, field):
    v = row["target"].get(field)
    if (
        field in row.get("unscored_fields", [])
        or v is None
        or v in ("unknown", "not_applicable")
    ):
        return None
    return json.dumps(sorted(v) if isinstance(v, list) else v, ensure_ascii=False)


def divergence(a, b):
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    p, q = a / a.sum(axis=-1, keepdims=True), b / b.sum(axis=-1, keepdims=True)
    m = (p + q) / 2
    with np.errstate(divide="ignore", invalid="ignore"):
        return (
            np.where(p > 0, p * np.log2(p / m), 0).sum(axis=-1)
            + np.where(q > 0, q * np.log2(q / m), 0).sum(axis=-1)
        ) / 2


def test_counts(a, b, rng, repeats):
    keys = sorted(set(a) | set(b))
    x = np.array([a.get(k, 0) for k in keys], dtype=np.int64)
    y = np.array([b.get(k, 0) for k in keys], dtype=np.int64)
    combined = x + y
    shuffled = rng.multivariate_hypergeometric(combined, int(x.sum()), size=repeats)
    return float(divergence(x, y)), divergence(shuffled, combined - shuffled)


def adjust(results, pkey, qkey):
    ordered = sorted(
        (r for r in results if r.get(pkey) is not None), key=lambda r: r[pkey]
    )
    previous = 1.0
    for rank in range(len(ordered), 0, -1):
        r = ordered[rank - 1]
        previous = min(previous, r[pkey] * len(ordered) / rank)
        r[qkey] = previous


def analyze(reference, current, repeats=999, seed=42):
    rng = np.random.default_rng(seed)
    results = []
    for field in t.schema(reference[0].get("schema_id", t.LEGACY)):
        a = [(t.category(r.get("category")), value(r, field)) for r in reference]
        b = [(t.category(r.get("category")), value(r, field)) for r in current]
        a = [(c, v) for c, v in a if v is not None]
        b = [(c, v) for c, v in b if v is not None]
        row = {
            "field": field,
            "reference_scored": len(a),
            "current_scored": len(b),
            "reference_coverage": len(a) / len(reference),
            "current_coverage": len(b) / len(current),
        }
        if a and b:
            score, null = test_counts(
                Counter(v for c, v in a), Counter(v for c, v in b), rng, repeats
            )
            row.update(
                js_divergence=score,
                p_value=float((1 + np.sum(null >= score - 1e-12)) / (repeats + 1)),
            )
            strata = []
            for category in sorted({c for c, v in a + b}, key=str):
                x, y = (
                    Counter(v for c, v in a if c == category),
                    Counter(v for c, v in b if c == category),
                )
                if min(sum(x.values()), sum(y.values())) < 10:
                    continue
                observed, control = test_counts(x, y, rng, repeats)
                strata.append(
                    (min(sum(x.values()), sum(y.values())), observed, control, category)
                )
            if strata:
                weight = sum(n for n, *_ in strata)
                observed = sum(n * v for n, v, _, _ in strata) / weight
                control = sum(n * v for n, _, v, _ in strata) / weight
                row.update(
                    category_adjusted_js=observed,
                    category_adjusted_p=float(
                        (1 + np.sum(control >= observed - 1e-12)) / (repeats + 1)
                    ),
                    included_categories=[c for _, _, _, c in strata],
                )
        results.append(row)
    adjust(results, "p_value", "q_value")
    adjust(results, "category_adjusted_p", "category_adjusted_q")
    return {
        "fields": results,
        "permutations": repeats,
        "seed": seed,
        "method": "pooled-count permutation; BH correction within each test family; category strata min 10/domain",
        "note": "카테고리 구성 차이를 보정한 탐색적 비교입니다. AI 레이블과 표본 독립성 가정에 의존하며 시계열 변화·성능 저하의 증거는 아닙니다.",
    }
