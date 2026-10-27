"""Create versioned, conservative mappings; never fabricate missing supervision."""

import copy
import hashlib
import json
from collections import Counter
from . import store as s
from . import taxonomy as t

POLICY = "conservative-v1"


def convert(row):
    out = copy.deepcopy(row)
    scope = t.category(row["category"])
    allowed = t.schema(t.CURRENT, scope)
    old = row["target"]
    target = {
        k: []
        if k == "details"
        else "not_applicable"
        if values == ["not_applicable"]
        else "unknown"
        for k, values in allowed.items()
    }
    aliases = {
        "fit": {"슬림": "슬림핏", "레귤러": "레귤러핏", "루즈": "루즈핏"}
        if scope in ("상의", "아우터")
        else {},
        "sleeve": {"반팔": "반소매", "긴팔": "긴소매"},
        "neckline": {
            "라운드": "라운드넥",
            "브이넥": "V넥",
            "카라형": "카라넥",
            "헨리넥": "헨리넥",
            "후드형": "후드",
        },
    }
    for key in ("fit", "length", "sleeve", "neckline", "pattern"):
        value = aliases.get(key, {}).get(old.get(key), old.get(key))
        if (
            value in allowed[key]
            and value not in ("unknown", "not_applicable")
            and key not in row.get("unscored_fields", [])
        ):
            target[key] = value
    # Legacy "plain" explicitly ignored small graphics, so do not equate it to workbook plain.
    if old.get("pattern") == "무지" and old.get("graphic_location") not in (
        "없음",
        "unknown",
        None,
    ):
        target["pattern"] = "unknown"
    fabric = {
        "데님외관": "데님",
        "니트조직": "니트",
        "케이블니트": "니트",
        "플리스": "플리스",
    }.get(old.get("surface_texture"))
    if fabric and "surface_texture" not in row.get("unscored_fields", []):
        target["fabric"] = fabric
    detail_map = {"레터링패치": "패치", "배색라인": "배색", "카고포켓": "카고"}
    target["details"] = sorted(
        {
            detail_map.get(v, v)
            for v in old.get("details", [])
            if detail_map.get(v, v) in allowed["details"]
        }
    )
    # Old detail labels did not cover the workbook's full vocabulary: retain positives for review only.
    excluded = [k for k, v in target.items() if v in ("unknown", "not_applicable")] + [
        "details"
    ]
    out.setdefault("original_label_source", row.get("label_source", "unknown"))
    out.setdefault("label_history", []).append(
        {
            "at": s.now(),
            "parent_dataset_id": None,
            "before": {
                "target": old,
                "unscored_fields": row.get("unscored_fields", []),
                "human_verified": row.get("human_verified", False),
            },
            "note": "비케이브 기준 보수적 변환; 미확인 및 불완전 디테일은 학습·평가 제외",
            "channel": "taxonomy_mapping",
        }
    )
    out.update(
        target=target,
        category=scope,
        schema_id=t.CURRENT,
        unscored_fields=excluded,
        human_verified=False,
        reviewed_at=None,
        label_source="기존 레이블의 비케이브 기준 변환 · 사람 재검토 전",
        migration_pending=excluded,
    )
    assert t.valid(target, t.CURRENT, scope)
    return out


def migrate(parent_ids=None):
    results = []
    for parent in reversed(s.all_of("dataset")):
        if parent_ids is not None and parent["id"] not in parent_ids:
            continue
        if parent.get("schema_id", t.LEGACY) != t.LEGACY:
            continue
        key = hashlib.sha256(
            (parent["id"] + parent["fingerprint"] + t.CURRENT + POLICY).encode()
        ).hexdigest()[:24]
        did = "bkave-" + key
        try:
            existing = s.get("dataset", did)
            results.append(s.public_dataset(existing))
            continue
        except KeyError:
            pass
        rows = [convert(r) for r in parent["rows"]]
        for row in rows:
            row["label_history"][-1]["parent_dataset_id"] = parent["id"]
        coverage = Counter(
            k for r in rows for k in t.FIELDS if k not in r["unscored_fields"]
        )
        d = copy.deepcopy(parent)
        d.update(
            id=did,
            name=parent.get("annotation_base_name", parent["name"])
            + " · 비케이브 기준",
            schema_id=t.CURRENT,
            kind="taxonomy_migration",
            created_at=s.now(),
            rows=rows,
            parent_ids=[parent["id"]],
            provenance="비케이브 엑셀 기준 변환 · 미확인 학습/평가 제외",
            fingerprint=hashlib.sha256(
                json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()
            ).hexdigest(),
            taxonomy_source_sha256=t.BOOK["source_sha256"],
            mapping_policy=POLICY,
            label_coverage=dict(coverage),
        )
        d.pop("annotation_base_name", None)
        s.save("dataset", d)
        results.append(s.public_dataset(d))
    return results


if __name__ == "__main__":
    print(json.dumps(migrate(), ensure_ascii=False, indent=2))
