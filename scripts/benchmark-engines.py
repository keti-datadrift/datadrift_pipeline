"""Compare the existing Transformers evaluator and vLLM using identical held-out inputs."""

import argparse
import hashlib
import json
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend", choices=["transformers", "vllm"])
    parser.add_argument("payload")
    parser.add_argument("output")
    parser.add_argument(
        "--batch-only",
        action="store_true",
        help="Measure startup directly followed by the 24-image batch",
    )
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()
    started = time.perf_counter()
    import torch
    from PIL import Image, ImageOps
    from transformers import AutoProcessor

    from backend.schemas import taxonomy as t
    from backend.training import metrics, parse

    payload = json.loads(Path(args.payload).read_text())
    torch.set_num_threads(4)
    torch.manual_seed(42)
    processor = AutoProcessor.from_pretrained(
        payload["base_model"], local_files_only=True
    )
    processor.tokenizer.padding_side = "left"
    prompt_text = payload["model"].get("prompt") or t.prompt()

    def prepare(row):
        path = Path(row["image"])
        assert hashlib.sha256(path.read_bytes()).hexdigest() == row["sha256"]
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((512, 512))
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {
                        "type": "text",
                        "text": t.row_prompt(prompt_text, row, payload["schema_id"]),
                    },
                ],
            }
        ]
        return image, messages

    imported = time.perf_counter()
    if args.backend == "transformers":
        from peft import PeftModel
        from transformers import Qwen3_5ForConditionalGeneration

        torch.cuda.set_per_process_memory_fraction(0.55)
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
        model = PeftModel.from_pretrained(
            model, payload["model"]["adapter"], is_trainable=False
        )
        model.eval()

        def generate(rows):
            messages = [prepare(row)[1] for row in rows]
            batch = processor.apply_chat_template(
                messages,
                tokenize=True,
                return_dict=True,
                return_tensors="pt",
                padding=True,
                add_generation_prompt=True,
                enable_thinking=False,
            ).to("cuda:0")
            with torch.inference_mode():
                result = model.generate(
                    **batch,
                    max_new_tokens=payload["max_tokens"],
                    do_sample=False,
                    use_cache=True,
                )
            outputs = []
            for row, sequence in zip(rows, result, strict=False):
                ids = sequence[batch["input_ids"].shape[1] :].tolist()
                end = next(
                    (
                        i
                        for i, token in enumerate(ids)
                        if token in model.generation_config.eos_token_id
                    ),
                    None,
                )
                if end is not None:
                    ids = ids[: end + 1]
                outputs.append(
                    {
                        "sample_id": row["id"],
                        "raw": processor.tokenizer.decode(
                            ids, skip_special_tokens=True
                        ),
                        "tokens": len(ids),
                    }
                )
            return outputs
    else:
        from vllm import LLM, SamplingParams
        from vllm.lora.request import LoRARequest

        model = LLM(
            model=payload["base_model"],
            dtype="bfloat16",
            gpu_memory_utilization=0.4,
            max_model_len=8192,
            max_num_seqs=8,
            enable_lora=True,
            max_lora_rank=8,
            max_loras=1,
            max_cpu_loras=8,
            enforce_eager=True,
            enable_prefix_caching=False,
            mm_processor_cache_gb=0,
            limit_mm_per_prompt={"image": 1, "video": 0},
            mm_processor_kwargs={
                "size": {"longest_edge": 262144, "shortest_edge": 65536}
            },
        )
        lora = LoRARequest(payload["model"]["id"], 1, payload["model"]["adapter"])
        sampling = SamplingParams(
            temperature=0, max_tokens=payload["max_tokens"], seed=42
        )

        def generate(rows):
            inputs = []
            for row in rows:
                image, messages = prepare(row)
                prompt = processor.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True,
                    enable_thinking=False,
                )
                inputs.append({"prompt": prompt, "multi_modal_data": {"image": image}})
            results = model.generate(
                inputs, sampling, lora_request=lora, use_tqdm=False
            )
            return [
                {
                    "sample_id": row["id"],
                    "raw": result.outputs[0].text,
                    "tokens": len(result.outputs[0].token_ids),
                }
                for row, result in zip(rows, results, strict=False)
            ]

    loaded = time.perf_counter()
    first_started = time.perf_counter()
    generate([payload["warmup"]])
    first_seconds = time.perf_counter() - first_started
    records = []
    for row in [] if args.batch_only else payload["rows"]:
        request_started = time.perf_counter()
        result = generate([row])[0]
        result["seconds"] = time.perf_counter() - request_started
        records.append(result)
        print(
            json.dumps(
                {
                    "backend": args.backend,
                    "completed": len(records),
                    "total": len(payload["rows"]),
                    "seconds": round(result["seconds"], 3),
                }
            ),
            flush=True,
        )
    summary = {
        "backend": args.backend,
        "model_id": payload["model"]["id"],
        "adapter_sha256": payload["adapter_sha256"],
        "sample_ids": [r["id"] for r in payload["rows"]],
        "import_seconds": imported - started,
        "load_seconds": loaded - imported,
        "first_request_seconds": first_seconds,
        "cold_to_first_result_seconds": loaded - started + first_seconds,
        "serial_seconds": sum(r["seconds"] for r in records),
        "serial_records": records,
        "serial_metrics": metrics(
            payload["rows"], [parse(r["raw"]) for r in records], payload["schema_id"]
        )
        if records
        else None,
    }
    Path(args.output).write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.backend == "vllm" or args.batch_only:
        torch.cuda.reset_peak_memory_stats()
        batch_started = time.perf_counter()
        batched = []
        if args.backend == "transformers":
            for offset in range(0, len(payload["rows"]), args.batch_size):
                batched.extend(
                    generate(payload["rows"][offset : offset + args.batch_size])
                )
                print(
                    json.dumps(
                        {
                            "backend": args.backend,
                            "batch_size": args.batch_size,
                            "completed": len(batched),
                        }
                    ),
                    flush=True,
                )
        else:
            batched = generate(payload["rows"])
        summary.update(
            batch_seconds=time.perf_counter() - batch_started,
            batch_records=batched,
            batch_metrics=metrics(
                payload["rows"],
                [parse(r["raw"]) for r in batched],
                payload["schema_id"],
            ),
        )
        summary.update(
            batch_size=args.batch_size,
            peak_memory_allocated_bytes=torch.cuda.max_memory_allocated(),
            peak_memory_reserved_bytes=torch.cuda.max_memory_reserved(),
        )
        if args.batch_only:
            summary["startup_plus_batch_seconds"] = time.perf_counter() - started
    from importlib.metadata import version

    summary["versions"] = {
        name: version(name)
        for name in (
            "torch",
            "transformers",
            "vllm" if args.backend == "vllm" else "peft",
        )
    }
    Path(args.output).write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(
        json.dumps({k: v for k, v in summary.items() if k.endswith("seconds")}),
        flush=True,
    )


if __name__ == "__main__":
    main()
