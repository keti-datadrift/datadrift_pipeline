"""Catalog validation shared by workspace, reconstruction, and job requests."""

from backend.catalog import model_available
from backend.data import store as s
from backend.schemas import taxonomy


def workspace_labeling_model(workspace, dataset=None):
    return workspace.get("labeling_model_id", (dataset or {}).get("labeling_model_id"))


def selected_labeling_model(model_id, schema_id=None):
    if model_id in (None, "gemma4_teacher"):
        from backend.relabeling import TEACHER

        if not (TEACHER / "config.json").is_file():
            raise ValueError("Gemma 레이블링 모델 파일이 없습니다.")
        return None
    m = s.get("model", model_id)
    if m["status"] != "ready" or not model_available(m):
        raise ValueError("사용 가능한 모델을 선택하세요.")
    if (
        m["kind"] == "lora"
        and schema_id is not None
        and m.get("schema_id", taxonomy.LEGACY) != schema_id
    ):
        raise ValueError("데이터와 같은 레이블 형식으로 학습한 모델을 선택하세요.")
    return m


def require_labels(dataset):
    count = sum(row.get("label_state") == "unlabeled" for row in dataset["rows"])
    if count:
        raise ValueError(
            f"미레이블 이미지가 {count}개 있습니다. 자동 레이블링 또는 수동 검토를 먼저 완료하세요."
        )
