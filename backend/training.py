"""Local Qwen3.5 image-to-attribute SFT and held-out generation evaluation.

Requires the provisioned GPU environment; API and queue do not import torch.
Only language attention LoRA weights are optimized. Unknown/unscored value tokens
are masked. Evaluation never uses train rows and retains malformed generations.
"""

import hashlib
import json
import random
import re
import sys
import time
from pathlib import Path
from . import taxonomy as taxonomy

FIELDS = [
    "pattern",
    "fit",
    "sleeve",
    "length",
    "closure",
    "details",
    "neckline",
    "hood",
    "visible_pocket",
    "cuff",
    "hem",
    "surface_texture",
    "graphic_location",
    "graphic_scale",
]
SCHEMA = json.loads(Path(__file__).with_name("attribute_schema.json").read_text())
PROMPT = (
    "이미지 중앙에서 가장 크게 제시된 의류 하나의 시각적 속성을 추출하세요. "
    "전신 착장에서 상하의가 비슷하게 보이면 가장 바깥 상의/아우터를 대상으로 합니다. "
    "겹쳐 입은 다른 옷, 가방, 모자, 배경의 특징을 섞지 마세요. "
    "다음 14개 키를 모두 가진 JSON 객체 하나만 출력하세요. 키별 허용값을 그대로 사용하고 영어로 번역하지 마세요. "
    "details는 허용값 중 명백히 보이는 요소의 문자열 배열이며 없으면 빈 배열입니다. "
    "나머지 값은 문자열입니다. 판단할 수 없으면 unknown으로 출력하세요. "
    "작은 가슴 로고/배색선은 pattern=무지이며 큰 프린트/레터링은 그래픽입니다. "
    "하의의 sleeve,neckline,hood,cuff는 not_applicable이고 closure는 unknown입니다. "
    "상품 단독컷에서 착용 핏과 신체 기준 기장을 판단하기 어려우면 unknown입니다. "
    "소재 성분, 브랜드, 인기를 추측하지 마세요. 허용값: "
    + json.dumps(SCHEMA, ensure_ascii=False)
)


def write(path, obj):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(obj, ensure_ascii=False, indent=2))
    temp.replace(path)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parameter_hash(model):
    import torch

    h = hashlib.sha256()
    for n, p in sorted(model.named_parameters()):
        if "lora_" in n:
            h.update(n.encode())
            h.update(p.detach().cpu().view(torch.uint8).numpy().tobytes())
    return h.hexdigest()


def parse(raw):
    try:
        value = json.loads(raw.strip())
        return value if isinstance(value, dict) else None
    except ValueError:
        return None


def valid_schema(prediction, schema_id=taxonomy.LEGACY, scope=None):
    return taxonomy.valid(prediction, schema_id, scope)


def metrics(rows, predictions, schema_id=taxonomy.LEGACY):
    fields = list(taxonomy.schema(schema_id))
    by_field = {f: {"correct": 0, "count": 0} for f in fields}
    exact = 0
    for row, pred in zip(rows, predictions):
        correct = True
        scored = 0
        for field in fields:
            truth = row["target"].get(field)
            if field in row.get("unscored_fields", []) or truth in (None, "unknown"):
                continue
            expected = sorted(truth) if isinstance(truth, list) else truth
            actual = (pred or {}).get(field)
            if isinstance(actual, list):
                actual = sorted(str(v) for v in actual)
            match = actual == expected
            by_field[field]["count"] += 1
            by_field[field]["correct"] += int(match)
            correct &= match
            scored += 1
        exact += int(correct and scored > 0)
    scores = [v["correct"] / v["count"] for v in by_field.values() if v["count"]]
    return {
        "macro_attribute_accuracy": sum(scores) / len(scores) if scores else None,
        "exact_match": exact / len(rows),
        "parse_failures": sum(p is None for p in predictions),
        "schema_failures": sum(
            not valid_schema(p, schema_id, r.get("category"))
            for r, p in zip(rows, predictions)
        ),
        "fields": {
            f: v | {"accuracy": v["correct"] / v["count"] if v["count"] else None}
            for f, v in by_field.items()
        },
    }


def evaluation_rows(rows, limit, seed, sampling="random"):
    shuffled = rows.copy()
    random.Random(seed).shuffle(shuffled)
    if sampling == "random":
        return shuffled[:limit]
    groups = {
        source: [r for r in shuffled if r["source"] == source]
        for source in sorted({r["source"] for r in shuffled})
    }
    selected = []
    while len(selected) < min(limit, len(shuffled)):
        for group in groups.values():
            if group and len(selected) < limit:
                selected.append(group.pop(0))
    return selected


def main(path):
    import torch
    import torch.nn.functional as F
    from PIL import Image, ImageOps
    from peft import LoraConfig, PeftModel, get_peft_model
    from transformers import AutoProcessor, Qwen3_5ForConditionalGeneration

    payload = json.loads(Path(path).read_text())
    req = payload["request"]
    out = Path(payload["output"])
    started = time.monotonic()
    torch.set_num_threads(4)
    torch.manual_seed(req["seed"])
    torch.cuda.set_per_process_memory_fraction(0.55)
    schema_id = payload.get("schema_id", taxonomy.LEGACY)
    fields = list(taxonomy.schema(schema_id))
    prompt_text = payload.get("prompt") or (
        taxonomy.prompt() if schema_id == taxonomy.CURRENT else PROMPT
    )
    progress = {
        "phase": "loading",
        "step": 0,
        "total": req["max_steps"]
        if req["kind"] == "training"
        else min(req["sample_limit"], len(payload["rows"])),
        "history": [],
    }

    def report(**values):
        progress.update(values, elapsed_seconds=round(time.monotonic() - started, 2))
        write(out / "progress.json", progress)

    report()
    processor = AutoProcessor.from_pretrained(
        payload["base_model"], local_files_only=True
    )
    processor.tokenizer.padding_side = "left"
    model = Qwen3_5ForConditionalGeneration.from_pretrained(
        payload["base_model"],
        local_files_only=True,
        dtype=torch.bfloat16,
        device_map={"": "cuda:0"},
        attn_implementation="sdpa",
    )
    model.generation_config.eos_token_id = sorted(
        {processor.tokenizer.eos_token_id, model.config.text_config.eos_token_id}
    )
    model.generation_config.pad_token_id = processor.tokenizer.pad_token_id
    is_training = req["kind"] == "training"
    if payload["model"].get("adapter"):
        model = PeftModel.from_pretrained(
            model, payload["model"]["adapter"], is_trainable=is_training
        )
    elif is_training:
        targets = [
            n
            for n, m in model.named_modules()
            if isinstance(m, torch.nn.Linear)
            and "language_model" in n
            and n.endswith(
                ("q_proj", "k_proj", "v_proj", "o_proj", "in_proj_qkv", "out_proj")
            )
        ]
        if not targets:
            raise ValueError("No LoRA target modules")
        model = get_peft_model(
            model,
            LoraConfig(
                r=8,
                lora_alpha=8,
                lora_dropout=0,
                target_modules=targets,
                bias="none",
                task_type="CAUSAL_LM",
            ),
        )

    def encode(row, answer=None):
        if sha(Path(row["image"])) != row["sha256"]:
            raise ValueError("Source image changed")
        with Image.open(row["image"]) as src:
            im = ImageOps.exif_transpose(src).convert("RGB")
            im.thumbnail((512, 512))
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": im},
                    {
                        "type": "text",
                        "text": taxonomy.row_prompt(prompt_text, row, schema_id),
                    },
                ],
            }
        ]
        if answer is not None:
            messages.append(
                {"role": "assistant", "content": [{"type": "text", "text": answer}]}
            )
        return processor.apply_chat_template(
            [messages],
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
            padding=True,
            add_generation_prompt=answer is None,
            enable_thinking=False,
        )

    rng = random.Random(req["seed"])
    rows = payload["rows"].copy()
    rng.shuffle(rows)
    if is_training:
        if any(r["split"] != "train" for r in rows):
            raise ValueError("Held-out sample in training input")
        model.config.use_cache = False
        model.gradient_checkpointing_enable(
            gradient_checkpointing_kwargs={"use_reentrant": False}
        )
        model.enable_input_require_grads()
        parameters = [p for p in model.parameters() if p.requires_grad]
        if any(
            "lora_" not in n for n, p in model.named_parameters() if p.requires_grad
        ):
            raise ValueError("Non-LoRA weights are trainable")
        optimizer = torch.optim.AdamW(
            parameters, lr=req["learning_rate"], weight_decay=0
        )
        before = parameter_hash(model)
        model.train()
        used = []
        for step in range(req["max_steps"]):
            row = rows[step % len(rows)]
            used.append(row["id"])
            answer = json.dumps(row["target"], ensure_ascii=False)
            prompt = encode(row)
            full = encode(row, answer)
            start = prompt["input_ids"].shape[1]
            if not torch.equal(prompt["input_ids"], full["input_ids"][:, :start]):
                raise ValueError("Chat template prefix mismatch")
            tokens = full["input_ids"][0, start:].tolist()
            eos = model.generation_config.eos_token_id
            end = next((i for i, t in enumerate(tokens) if t in eos), None)
            if end is None:
                raise ValueError("Answer is unterminated")
            tokens = tokens[: end + 1]
            encoded = processor.tokenizer(
                answer, add_special_tokens=False, return_offsets_mapping=True
            )
            if tokens[:-1] != encoded["input_ids"]:
                raise ValueError("Answer token alignment mismatch")
            mask = torch.ones(len(tokens), dtype=torch.bool, device="cuda:0")
            for field in fields:
                if (
                    field not in row.get("unscored_fields", [])
                    and row["target"].get(field) != "unknown"
                ):
                    continue
                match = re.search(
                    r'"'
                    + re.escape(field)
                    + r'"\s*:\s*(\[[^\]]*\]|"[^"\\]*(?:\\.[^"\\]*)*")',
                    answer,
                )
                if match:
                    lo, hi = match.span(1)
                    for i, (begin, end) in enumerate(encoded["offset_mapping"]):
                        if begin < hi and end > lo:
                            mask[i] = False
            response = torch.tensor(tokens, dtype=prompt["input_ids"].dtype)
            inputs = dict(prompt)
            inputs["input_ids"] = torch.cat(
                [prompt["input_ids"], response[None, :]], dim=1
            )
            inputs["attention_mask"] = torch.ones_like(inputs["input_ids"])
            if "mm_token_type_ids" in inputs:
                inputs["mm_token_type_ids"] = torch.cat(
                    [
                        prompt["mm_token_type_ids"],
                        torch.zeros(
                            (1, len(tokens)), dtype=prompt["mm_token_type_ids"].dtype
                        ),
                    ],
                    dim=1,
                )
            inputs = {k: v.to("cuda:0") for k, v in inputs.items()}
            response = response.to("cuda:0")
            positions = torch.arange(
                start - 1, start - 1 + len(tokens), device="cuda:0"
            )
            optimizer.zero_grad(set_to_none=True)
            logits = (
                model(**inputs, use_cache=False, logits_to_keep=positions)
                .logits[0]
                .float()
            )
            loss = F.cross_entropy(logits, response, reduction="none")[mask].mean()
            if not torch.isfinite(loss):
                raise ValueError("Nonfinite training loss")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(parameters, 1.0, error_if_nonfinite=True)
            optimizer.step()
            progress["history"].append({"step": step + 1, "loss": float(loss.detach())})
            report(phase="training", step=step + 1, loss=float(loss.detach()))
        after = parameter_hash(model)
        if before == after:
            raise ValueError("Adapter did not change")
        model.save_pretrained(out / "adapter", safe_serialization=True)
        write(
            out / "result.json",
            {
                "schema_id": schema_id,
                "taxonomy_snapshot": taxonomy.BOOK
                if schema_id == taxonomy.CURRENT
                else None,
                "optimizer_steps": req["max_steps"],
                "training_sample_ids": sorted(set(used)),
                "adapter_sha256": sha(out / "adapter/adapter_model.safetensors"),
                "initial_parameter_sha256": before,
                "final_parameter_sha256": after,
                "policy_changed": True,
                "dataset_fingerprint": payload["dataset_fingerprint"],
                "trainable_parameters": sum(p.numel() for p in parameters),
                "loss": progress["history"][-1]["loss"],
                "prompt": prompt_text,
                "prompt_sha256": hashlib.sha256(prompt_text.encode()).hexdigest(),
                "framework": "transformers+peft",
                "elapsed_seconds": time.monotonic() - started,
            },
        )
    else:
        rows = evaluation_rows(
            payload["rows"],
            req["sample_limit"],
            req["seed"],
            req.get("sampling", "random"),
        )
        if any(r["split"] not in ("validation", "test") for r in rows):
            raise ValueError("Training sample in evaluation input")
        model.eval()
        predictions = []
        records = []
        for i, row in enumerate(rows):
            batch = encode(row).to("cuda:0")
            with torch.inference_mode():
                output = model.generate(
                    **batch, max_new_tokens=512, do_sample=False, use_cache=True
                )
            raw = processor.tokenizer.decode(
                output[0, batch["input_ids"].shape[1] :], skip_special_tokens=True
            )
            pred = parse(raw)
            predictions.append(pred)
            records.append(
                {
                    "sample_id": row["id"],
                    "source": row["source"],
                    "split": row["split"],
                    "raw": raw,
                    "prediction": pred,
                    "schema_valid": valid_schema(pred, schema_id, row.get("category")),
                    "target": row["target"],
                    "human_verified": row["human_verified"],
                    "label_source": row["label_source"],
                }
            )
            report(phase="evaluating", step=i + 1)
        result = metrics(rows, predictions, schema_id) | {
            "schema_id": schema_id,
            "count": len(rows),
            "split": req["split"],
            "predictions": records,
            "by_source": {},
            "prompt_sha256": hashlib.sha256(prompt_text.encode()).hexdigest(),
            "note": "AI 레이블과의 일치도이며 사람 검증 정답에 대한 성능을 뜻하지 않습니다.",
        }
        for source in sorted({r["source"] for r in rows}):
            pairs = [(r, p) for r, p in zip(rows, predictions) if r["source"] == source]
            result["by_source"][source] = metrics(
                [r for r, p in pairs], [p for r, p in pairs], schema_id
            ) | {"count": len(pairs)}
        write(out / "result.json", result)
    report(phase="completed")


if __name__ == "__main__":
    main(sys.argv[1])
