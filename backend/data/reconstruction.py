"""Training data selection and source mixing."""

import json
import math
import random
from collections import Counter, defaultdict

MISSING = "__missing__"
CANDIDATE_SPLITS = ("train", "unassigned")


def value(row, field):
    if field == "category":
        result = row.get("category")
    else:
        if field in row.get("unscored_fields", []):
            return MISSING
        result = row.get("target", {}).get(field)
    if result is None or result in ("unknown", "not_applicable", ""):
        return MISSING
    return json.dumps(
        sorted(result) if isinstance(result, list) else result,
        ensure_ascii=False,
        sort_keys=True,
    )


def divergence(a, b):
    na, nb = sum(a.values()), sum(b.values())
    if not na or not nb:
        return 0.0
    score = 0.0
    for key in a.keys() | b.keys():
        p, q = a[key] / na, b[key] / nb
        mean = (p + q) / 2
        if p:
            score += p * math.log2(p / mean) / 2
        if q:
            score += q * math.log2(q / mean) / 2
    return score


def counters(rows, fields):
    return {field: Counter(value(row, field) for row in rows) for field in fields}


def distance(rows, reference_counts, fields):
    observed = counters(rows, fields)
    return sum(
        divergence(observed[field], reference_counts[field]) for field in fields
    ) / len(fields)


def distribution_sample(rows, reference, count, seed):
    names = sorted(
        {"category"} | {key for row in reference for key in row.get("target", {})}
    )
    reference_counts = counters(reference, names)
    # Excluded/unknown attributes never become a target label distribution.
    for counts in reference_counts.values():
        counts.pop(MISSING, None)
    fields = [field for field in names if reference_counts[field]]
    if not fields:
        raise ValueError("기준 데이터에 비교할 속성 레이블이 없습니다.")
    rng = random.Random(seed)
    buckets = defaultdict(list)
    for row in rows:
        buckets[tuple((field, value(row, field)) for field in fields)].append(row)
    signatures = list(buckets)
    rng.shuffle(signatures)
    for bucket in buckets.values():
        rng.shuffle(bucket)
    targets = {
        (field, token): count * n / sum(reference_counts[field].values())
        for field in fields
        for token, n in reference_counts[field].items()
    }
    selected_counts = Counter()
    chosen = []
    available = signatures[:]
    if count == len(rows):
        chosen = list(rows)
    else:
        for _ in range(count):
            # Limit the candidate search for interactive previews.
            candidates = (
                available if len(available) <= 256 else rng.sample(available, 256)
            )
            signature = max(
                candidates,
                key=lambda keys: sum(
                    2 * (targets.get(key, 0) - selected_counts[key]) - 1 for key in keys
                ),
            )
            chosen.append(buckets[signature].pop())
            selected_counts.update(signature)
            if not buckets[signature]:
                available.remove(signature)
        # Use the seeded random sample when it matches the target more closely.
        baseline = random.Random(seed).sample(rows, count)
        if distance(baseline, reference_counts, fields) < distance(
            chosen, reference_counts, fields
        ):
            chosen = baseline
    return chosen, {
        "fields": fields,
        "before_js": distance(rows, reference_counts, fields),
        "after_js": distance(chosen, reference_counts, fields),
    }


def balanced_mix(parents, count, seed, weights=None):
    """Keep snapshot quotas while sampling their attribute distributions.

    A shared image is assigned to exactly one input snapshot. Subset capacity
    checks keep the remaining quotas feasible even when inputs overlap.
    """
    groups = sorted(parents, key=lambda d: d["id"])
    ids = [d["id"] for d in groups]
    if count is None or count < 1:
        raise ValueError("데이터 수를 입력하세요.")
    if weights and set(weights) != set(ids):
        raise ValueError("선택한 원본별 혼합 비율을 지정하세요.")
    raw_weights = [float((weights or {}).get(did, 1)) for did in ids]
    if any(not math.isfinite(w) or w < 0 or w > 100 for w in raw_weights) or not sum(
        raw_weights
    ):
        raise ValueError(
            "혼합 비율은 0~100으로 입력하고 하나 이상을 0보다 크게 지정하세요."
        )
    proportions = [w / sum(raw_weights) for w in raw_weights]
    exact = [count * w for w in proportions]
    quotas = [math.floor(n) for n in exact]
    for i in sorted(range(len(ids)), key=lambda i: (-(exact[i] - quotas[i]), ids[i]))[
        : count - sum(quotas)
    ]:
        quotas[i] += 1

    pools, representatives, membership = [], {}, {}
    for i, parent in enumerate(groups):
        pool = {}
        for row in parent["rows"]:
            if row["split"] not in CANDIDATE_SPLITS:
                continue
            key = row["sha256"]
            previous = representatives.get(key)
            if previous and (
                previous["target"] != row["target"]
                or previous.get("category") != row.get("category")
                or set(previous.get("unscored_fields", []))
                != set(row.get("unscored_fields", []))
            ):
                raise ValueError("중복 이미지의 레이블 또는 제외 속성이 서로 다릅니다.")
            pool.setdefault(key, row)
            representatives.setdefault(key, row)
            membership[key] = membership.get(key, 0) | (1 << i)
        pools.append(pool)
    if count > len(representatives):
        raise ValueError(f"데이터는 최대 {len(representatives)}개입니다.")

    subsets = list(range(1, 1 << len(groups)))
    pattern_counts = Counter(membership.values())
    capacity = {
        s: sum(n for mask, n in pattern_counts.items() if mask & s) for s in subsets
    }
    demand = {s: sum(q for i, q in enumerate(quotas) if s & (1 << i)) for s in subsets}
    for subset in sorted(subsets, key=lambda s: (s.bit_count(), s)):
        if demand[subset] > capacity[subset]:
            names = ", ".join(
                groups[i]["name"] for i in range(len(groups)) if subset & (1 << i)
            )
            raise ValueError(
                f"{names}: 목표 {demand[subset]}개를 채우려면 중복 제외 데이터가 부족합니다. "
                f"사용 가능한 데이터는 {capacity[subset]}개입니다. 데이터 수나 혼합 비율을 조정하세요."
            )

    names = sorted(
        {"category"}
        | {k for row in representatives.values() for k in row.get("target", {})}
    )
    profiles = [counters(list(pool.values()), names) for pool in pools]
    for profile in profiles:
        for counts in profile.values():
            counts.pop(MISSING, None)
    fields = [
        f
        for f in names
        if any(proportions[i] and profile[f] for i, profile in enumerate(profiles))
    ]
    if not fields:
        raise ValueError("원본에 비교할 속성 레이블이 없습니다.")
    mixed_profile = {f: Counter() for f in fields}
    for f in fields:
        observed_weight = sum(
            proportions[i] for i, profile in enumerate(profiles) if profile[f]
        )
        for i, profile in enumerate(profiles):
            total = sum(profile[f].values())
            if total and proportions[i]:
                for token, n in profile[f].items():
                    mixed_profile[f][token] += (
                        proportions[i] * n / total / observed_weight
                    )
    group_fields = [[f for f in fields if profile[f]] for profile in profiles]
    targets = {
        (i, f, token): quotas[i] * n / sum(profile[f].values())
        for i, profile in enumerate(profiles)
        for f in group_fields[i]
        for token, n in profile[f].items()
    }
    bucket_rows = defaultdict(list)
    for key in sorted(representatives):
        signature = tuple(value(representatives[key], f) for f in fields)
        bucket_rows[(membership[key], signature)].append(key)
    field_indexes = {f: i for i, f in enumerate(fields)}

    def sample(use_distribution):
        rng = random.Random(seed)
        buckets = {key: list(rows) for key, rows in bucket_rows.items()}
        available = list(buckets)
        rng.shuffle(available)
        for rows in buckets.values():
            rng.shuffle(rows)
        remaining, caps, needs = list(quotas), dict(capacity), dict(demand)
        seen, chosen, assigned = Counter(), [], []
        for _ in range(count):
            active = sum(1 << i for i, q in enumerate(remaining) if q)
            tight = [s for s in subsets if caps[s] == needs[s]]
            allowed_cache = {}

            def options(
                bucket, allowed_cache=allowed_cache, active=active, tight=tight
            ):
                mask = bucket[0]
                if mask not in allowed_cache:
                    allowed = mask & active
                    for subset in tight:
                        if mask & subset:
                            allowed &= subset
                    allowed_cache[mask] = [
                        i for i in range(len(groups)) if allowed & (1 << i)
                    ]
                return allowed_cache[mask]

            candidates = (
                available if len(available) <= 256 else rng.sample(available, 256)
            )
            if not use_distribution:
                candidates = rng.sample(candidates, len(candidates))
            best, best_score = None, -math.inf
            for bucket in candidates:
                eligible = options(bucket)
                if not use_distribution and eligible:
                    best = (bucket, rng.choice(eligible))
                    break
                for i in eligible:
                    score = sum(
                        2
                        * (
                            targets.get((i, f, bucket[1][field_indexes[f]]), 0)
                            - seen[(i, f, bucket[1][field_indexes[f]])]
                        )
                        - 1
                        for f in group_fields[i]
                    ) / max(1, len(group_fields[i]))
                    if score > best_score:
                        best, best_score = (bucket, i), score
            if best is None:
                # A bounded search may miss a feasible bucket near quota completion.
                best = next(
                    (
                        (bucket, options(bucket)[0])
                        for bucket in available
                        if options(bucket)
                    ),
                    None,
                )
            if best is None:
                raise RuntimeError("혼합 비율에 맞는 데이터를 배정하지 못했습니다.")
            bucket, i = best
            key = buckets[bucket].pop()
            chosen.append(pools[i][key])
            assigned.append(i)
            seen.update((i, f, bucket[1][field_indexes[f]]) for f in group_fields[i])
            remaining[i] -= 1
            for subset in subsets:
                caps[subset] -= bool(bucket[0] & subset)
                needs[subset] -= bool(subset & (1 << i))
            if not buckets[bucket]:
                available.remove(bucket)
            if not remaining[i]:
                active &= ~(1 << i)
                available = [b for b in available if b[0] & active]
        return chosen, assigned

    def fit(rows, assigned):
        return sum(
            proportions[i]
            * distance(
                [r for r, owner in zip(rows, assigned, strict=False) if owner == i],
                profiles[i],
                group_fields[i],
            )
            for i in range(len(groups))
            if quotas[i] and group_fields[i]
        )

    chosen, assigned = sample(True)
    baseline, baseline_assignment = sample(False)
    if fit(baseline, baseline_assignment) < fit(chosen, assigned):
        chosen, assigned = baseline, baseline_assignment
    selected_counts = Counter(assigned)
    return chosen, {
        "fields": fields,
        "before_js": distance(list(representatives.values()), mixed_profile, fields),
        "after_js": distance(chosen, mixed_profile, fields),
        "mix": [
            {
                "dataset_id": d["id"],
                "name": d["name"],
                "workspace_id": d["workspace_id"],
                "target_ratio": proportions[i],
                "target_count": quotas[i],
                "actual_ratio": selected_counts[i] / count,
                "selected_count": selected_counts[i],
                "available_count": len(pools[i]),
            }
            for i, d in enumerate(groups)
        ],
    }


def select(rows, count, method, seed, reference=None):
    if not rows:
        raise ValueError("선택한 원본에 재구성할 데이터가 없습니다.")
    if method == "merge":
        return list(rows), {}
    if count is None:
        raise ValueError("데이터 수를 입력하세요.")
    if count > len(rows):
        raise ValueError(f"데이터는 최대 {len(rows)}개입니다.")
    if method == "distribution":
        if not reference:
            raise ValueError("기준 워크스페이스에 학습 데이터가 없습니다.")
        return distribution_sample(rows, reference, count, seed)
    rng = random.Random(seed)
    if method == "random":
        return rng.sample(rows, count), {}
    groups = defaultdict(list)
    for row in rows:
        groups[row.get("source", "unknown")].append(row)
    for group in groups.values():
        rng.shuffle(group)
    chosen = []
    while len(chosen) < count:
        for source in sorted(groups):
            if groups[source] and len(chosen) < count:
                chosen.append(groups[source].pop())
    return chosen, {}
