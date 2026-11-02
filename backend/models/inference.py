"""Resident vLLM inference behind the existing durable model API queue."""

import base64
import hashlib
import io
import os
import time
from pathlib import Path

import httpx
from PIL import Image, ImageOps

from backend import vllm_runtime
from backend.data import store as s
from backend.relabeling import convert
from backend.schemas import taxonomy as t


class InferenceCancelled(Exception):
    pass


def server_url(family):
    name = {"qwen35_2b": "DATADRIFT_VLLM_2B_URL", "qwen35_4b": "DATADRIFT_VLLM_4B_URL"}[
        family
    ]
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"vLLM 서버 주소가 설정되지 않았습니다: {family}")
    return value.rstrip("/")


def checked(response):
    if response.is_error:
        raise RuntimeError(
            f"vLLM 요청 실패 (HTTP {response.status_code}): {response.text[:500]}"
        )
    return response


def ready_models(client, heartbeat, ready=lambda: True):
    deadline = time.monotonic() + float(
        os.environ.get("DATADRIFT_VLLM_READY_TIMEOUT", "600")
    )
    while True:
        heartbeat()
        try:
            if not ready():
                raise RuntimeError("vLLM 서버 시작을 기다리고 있습니다.")
            response = checked(client.get("/v1/models", timeout=5))
            return {m["id"] for m in response.json()["data"]}
        except (httpx.TransportError, RuntimeError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(1)


def infer(model, row, report):
    started = time.monotonic()
    report("loading", 0)
    raw_path = Path(row["image"])
    if hashlib.sha256(raw_path.read_bytes()).hexdigest() != row["sha256"]:
        raise ValueError("입력 이미지가 변경되었습니다.")
    with Image.open(raw_path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((512, 512))
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
    prompt = model.get("prompt") or t.prompt()
    with httpx.Client(base_url=server_url(model["family"]), timeout=180) as client:
        available = ready_models(
            client,
            lambda: report("loading", 0),
            lambda: vllm_runtime.is_ready(model["family"]),
        )
        if model["id"] not in available:
            if model["kind"] != "lora":
                raise RuntimeError("선택한 기본 모델이 vLLM 서버에 없습니다.")
            checked(
                client.post(
                    "/v1/load_lora_adapter",
                    json={"lora_name": model["id"], "lora_path": model["adapter"]},
                )
            )
        report("inference", 0)
        response = checked(
            client.post(
                "/v1/chat/completions",
                json={
                    "model": model["id"],
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": "data:image/png;base64,"
                                        + base64.b64encode(buffer.getvalue()).decode()
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": t.row_prompt(prompt, row, t.CURRENT),
                                },
                            ],
                        }
                    ],
                    "temperature": 0,
                    "max_tokens": 512,
                    "seed": 42,
                    "chat_template_kwargs": {"enable_thinking": False},
                },
            )
        ).json()
    raw = response["choices"][0]["message"]["content"] or ""
    metadata = {
        "model_id": model["id"],
        "model_name": model["name"],
        "policy": "vllm-selected-model-v1",
        "schema_id": t.CURRENT,
        "created_at": s.now(),
        "image_only": True,
        "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest(),
        "adapter_sha256": hashlib.sha256(
            (Path(model["adapter"]) / "adapter_model.safetensors").read_bytes()
        ).hexdigest()
        if model.get("adapter")
        else None,
    }
    result = convert(row, raw, metadata, t.CURRENT)
    report("completed", 1)
    return {
        "category": result.get("category"),
        "category_valid": result["ai_label"]["category_valid"],
        "attributes": result["target"],
        "excluded_attributes": result["unscored_fields"],
        "schema_valid": result["ai_label"]["schema_valid"],
        "parse_valid": result["ai_label"]["parsed"] is not None,
        "raw": raw,
        "model_id": model["id"],
        "schema_id": t.CURRENT,
        "processing_seconds": round(time.monotonic() - started, 2),
        "teacher": metadata,
        "engine": "vllm",
    }


def run(job):
    started = time.monotonic()
    model = s.get("model", job["request"]["model_id"])
    if model["status"] != "ready" or model.get("retired_at"):
        raise ValueError("사용 가능한 모델을 선택하세요.")

    def report(phase, step):
        if s.get("job", job["id"])["cancel_requested"]:
            raise InferenceCancelled()
        s.patch(
            "job",
            job["id"],
            progress={
                "phase": phase,
                "step": step,
                "total": 1,
                "elapsed_seconds": round(time.monotonic() - started, 2),
            },
        )

    try:
        result = infer(model, job["input_row"], report)
    except InferenceCancelled:
        s.patch("job", job["id"], status="cancelled", finished_at=s.now())
        return
    with s.db() as con:
        con.execute("BEGIN IMMEDIATE")
        latest = s.get("job", job["id"], con)
        if latest["cancel_requested"]:
            latest.update(status="cancelled", finished_at=s.now())
        else:
            latest.update(status="succeeded", finished_at=s.now(), result=result)
        s.save("job", latest, con)
