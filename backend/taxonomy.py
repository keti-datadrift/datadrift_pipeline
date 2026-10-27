"""Versioned schemas: workbook values are preserved exactly; abstention is system metadata."""

import json
from pathlib import Path

LEGACY = "visual-v1"
LEGACY_SCHEMA = json.loads(
    Path(__file__).with_name("attribute_schema.json").read_text()
)
BOOK = json.loads(Path(__file__).with_name("bkave_taxonomy.json").read_text())
CURRENT = BOOK["id"]
NAMES = {
    "fit": "핏",
    "length": "기장",
    "sleeve": "소매 길이",
    "neckline": "넥라인",
    "pattern": "무늬",
    "details": "디자인 디테일",
    "fabric": "원단 유형",
    "origin": "생산처",
    "color_code": "색상 코드",
}
FIELDS = list(NAMES)
CATEGORIES = ["아우터", "상의", "하의", "ACC"]


def category(value):
    return {"바지": "하의"}.get(value, value)


def schema(schema_id=LEGACY, scope=None):
    if schema_id == LEGACY:
        return LEGACY_SCHEMA
    if schema_id != CURRENT:
        raise ValueError("지원하지 않는 레이블 기준입니다.")
    if scope is not None and category(scope) not in CATEGORIES:
        raise ValueError("비케이브 속성 카테고리를 선택하세요.")
    groups = (
        [BOOK["groups"][category(scope)]]
        if scope is not None
        else [BOOK["groups"][c] for c in CATEGORIES]
    )
    result = {}
    for key, name in NAMES.items():
        if key == "color_code":
            values = [c["code"] for c in BOOK["colors"]]
        elif name in BOOK["groups"]["공통"]:
            values = BOOK["groups"]["공통"][name]
        else:
            values = list(
                dict.fromkeys(v for group in groups for v in group.get(name, []))
            )
        # not_applicable is not a vendor label; it represents an absent field for this scope.
        result[key] = (
            values + ([] if key == "details" else ["unknown"])
            if values
            else ["not_applicable"]
        )
    return result


def valid(target, schema_id=LEGACY, scope=None):
    allowed = schema(schema_id, scope)
    if not isinstance(target, dict) or set(target) != set(allowed):
        return False
    for key, value in target.items():
        if key == "details":
            if (
                not isinstance(value, list)
                or any(not isinstance(v, str) or v not in allowed[key] for v in value)
                or len(value) != len(set(value))
            ):
                return False
        elif not isinstance(value, str) or value not in allowed[key]:
            return False
    return True


def prompt():
    return (
        "비케이브 제공 엑셀 기준으로 중심 상품의 시각적 속성을 추출하세요. 주어진 상품 카테고리의 허용값만 사용하세요. "
        "JSON 객체 하나만 출력하고 아래 키를 모두 포함하세요: "
        + ", ".join(FIELDS)
        + ". "
        "details는 문자열 배열, 나머지는 문자열입니다. 관찰 근거가 없거나 확실하지 않으면 unknown, 카테고리에 없는 속성은 not_applicable입니다. "
        "details에서 보이는 디자인 요소를 복수 선택하고 없으면 []입니다. 영어로 번역하거나 허용값을 바꾸지 마세요. "
        "origin(생산처)는 이미지로 알 수 없으므로 unknown입니다. color_code는 세부 코드까지 확실할 때만 선택하고 그렇지 않으면 unknown입니다. "
        "겹친 옷이나 배경의 특징을 섞지 마세요. 원단은 시각적으로 확인되는 유형만 선택하고 성분은 추측하지 마세요."
    )


def row_prompt(base, row, schema_id):
    if schema_id == LEGACY:
        return base
    values = schema(schema_id, row["category"])
    colors = "; ".join(c["code"] + "=" + c["name"] for c in BOOK["colors"])
    return (
        base
        + "\n상품 카테고리: "
        + category(row["category"])
        + "\n허용값: "
        + json.dumps(values, ensure_ascii=False)
        + "\n색상 코드 사전: "
        + colors
    )
