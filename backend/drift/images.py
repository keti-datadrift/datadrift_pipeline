"""Deterministic image sampling and a permutation-calibrated RBF MMD test."""

import hashlib
import json

import numpy as np

MIN_SAMPLES = 20
MAX_SAMPLES = 256
PERMUTATIONS = 999


def unique_rows(rows):
    unique = {}
    for row in rows:
        key = row.get("sha256") or row["image"]
        unique.setdefault(key, row)
    return unique


def prepare(reference, current, seed=42):
    a, b = unique_rows(reference), unique_rows(current)
    shared = a.keys() & b.keys()
    # A shared image is not an independent observation in a two-sample test.
    independent_a = [a[k] for k in sorted(a.keys() - shared)]
    independent_b = [b[k] for k in sorted(b.keys() - shared)]
    identical = a.keys() == b.keys() and all(
        json.dumps(
            [a[k].get("target"), a[k].get("unscored_fields", []), a[k].get("category")],
            sort_keys=True,
        )
        == json.dumps(
            [b[k].get("target"), b[k].get("unscored_fields", []), b[k].get("category")],
            sort_keys=True,
        )
        for k in shared
    )
    rng = np.random.default_rng(seed)

    def sample(rows):
        if len(rows) <= MAX_SAMPLES:
            return rows
        return [
            rows[i] for i in sorted(rng.choice(len(rows), MAX_SAMPLES, replace=False))
        ]

    return {
        "reference": independent_a,
        "current": independent_b,
        "image_reference": sample(independent_a),
        "image_current": sample(independent_b),
        "shared_images": len(shared),
        "identical_inputs": bool(a and b and identical),
        "reference_duplicates": len(reference) - len(a),
        "current_duplicates": len(current) - len(b),
    }


def mmd_test(reference, current, seed=42, repeats=PERMUTATIONS, report=None):
    x, y = (
        np.asarray(reference, dtype=np.float64),
        np.asarray(current, dtype=np.float64),
    )
    n, m = len(x), len(y)
    if min(n, m) < MIN_SAMPLES:
        return {
            "status": "insufficient",
            "reference_count": n,
            "current_count": m,
            "reason": f"독립 이미지가 각 {MIN_SAMPLES}장 이상 필요합니다.",
        }
    if (
        x.ndim != 2
        or y.ndim != 2
        or x.shape[1] != y.shape[1]
        or not np.isfinite(x).all()
        or not np.isfinite(y).all()
    ):
        raise ValueError("이미지 특징의 크기 또는 유효값을 확인하세요.")
    z = np.concatenate([x, y])
    z /= np.maximum(np.linalg.norm(z, axis=1, keepdims=True), 1e-12)
    norms = (z * z).sum(axis=1)
    d2 = np.maximum(norms[:, None] + norms[None, :] - 2 * (z @ z.T), 0)
    np.fill_diagonal(d2, 0)
    positive = d2[np.triu_indices(n + m, 1)]
    positive = positive[positive > 1e-12]
    bandwidth = float(np.median(positive)) if len(positive) else 1.0
    kernel = sum(np.exp(-d2 / (2 * bandwidth * scale)) for scale in (0.5, 1.0, 2.0)) / 3
    weights = np.r_[np.full(n, 1 / n), np.full(m, -1 / m)]
    observed = max(0.0, float(weights @ kernel @ weights))
    rng = np.random.default_rng(seed)
    null = []
    for offset in range(0, repeats, 32):
        assignments = np.full((min(32, repeats - offset), n + m), -1 / m)
        for row in assignments:
            row[rng.permutation(n + m)[:n]] = 1 / n
        null.extend(
            np.einsum("bi,ij,bj->b", assignments, kernel, assignments, optimize=False)
        )
        if report:
            report("testing_images", min(offset + 32, repeats), repeats)
    null = np.asarray(null)
    return {
        "status": "tested",
        "statistic": observed,
        "p_value": float((1 + np.sum(null >= observed - 1e-12)) / (repeats + 1)),
        "null_95": float(np.quantile(null, 0.95)),
        "reference_count": n,
        "current_count": m,
        "kernel": "mean RBF, median pooled squared distance × [0.5, 1, 2]",
        "bandwidth_squared": bandwidth,
        "permutations": repeats,
        "seed": seed,
        "method": "biased MMD² with fixed pooled kernel and label permutations",
    }


def sample_fingerprint(rows):
    return hashlib.sha256(
        "\n".join(r.get("sha256") or r["image"] for r in rows).encode()
    ).hexdigest()
