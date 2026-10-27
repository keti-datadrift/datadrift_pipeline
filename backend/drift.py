"""Descriptive domain drift; categorical JS divergence and RGB histogram distance."""

from collections import Counter
import numpy as np
from PIL import Image, ImageOps
from . import taxonomy
from .drift_statistics import analyze


def js(a, b):
    keys = sorted(set(a) | set(b))
    p = np.array([a.get(k, 0) for k in keys], dtype=float)
    q = np.array([b.get(k, 0) for k in keys], dtype=float)
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


def detect(reference, current, threshold):
    fields = []
    schema_id = reference[0].get("schema_id", taxonomy.LEGACY)
    for field in taxonomy.schema(schema_id):

        def counts(rows):
            result = Counter()
            for r in rows:
                if field in r.get("unscored_fields", []):
                    continue
                value = r["target"].get(field)
                if value in (None, "unknown", "not_applicable"):
                    continue
                result[str(sorted(value) if isinstance(value, list) else value)] += 1
            return result

        a, b = counts(reference), counts(current)
        if not a or not b:
            continue
        score = js(a, b)
        fields.append(
            {
                "field": field,
                "js_divergence": score,
                "detected": score >= threshold,
                "reference": dict(a),
                "current": dict(b),
            }
        )
    image_score = js(histogram(reference), histogram(current))
    statistics = analyze(reference, current)
    by_field = {v["field"]: v for v in statistics["fields"]}
    return {
        "comparison": "source/domain",
        "reference_count": len(reference),
        "current_count": len(current),
        "threshold": threshold,
        "fields": sorted(
            [f | by_field.get(f["field"], {}) for f in fields],
            key=lambda f: f["js_divergence"],
            reverse=True,
        ),
        "statistics": statistics,
        "image_histogram_js": image_score,
        "detected": image_score >= threshold or any(f["detected"] for f in fields),
        "note": "차이 감지는 JS 임계값 판정입니다. 속성별 보정 q와 카테고리 내 비교는 상세에서 확인하세요. AI 레이블 오류·제외율 차이가 영향을 줄 수 있으며 시간 경과에 따른 성능 저하를 확정하지 않습니다.",
    }
