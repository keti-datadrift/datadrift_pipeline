"""Exercise base/LoRA switching and eight concurrent image requests without editing data."""

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend.data import store as s
from backend.models import inference as vi


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("family", choices=["qwen35_2b", "qwen35_4b"])
    parser.add_argument("output")
    args = parser.parse_args()
    models = [
        m
        for m in s.all_of("model")
        if m["family"] == args.family
        and m["status"] == "ready"
        and not m.get("retired_at")
    ]
    data = s.get("dataset", s.dataset_summaries(current_only=True)[0]["id"])
    samples = [r | {"category": None} for r in data["rows"] if r["split"] == "test"][:8]

    def request(model, row):
        started = time.monotonic()
        result = vi.infer(model, row, lambda *args: None)
        assert result["parse_valid"], result["raw"]
        assert result["model_id"] == model["id"]
        return {
            "model_id": model["id"],
            "seconds": time.monotonic() - started,
            "parse_valid": result["parse_valid"],
            "schema_valid": result["schema_valid"],
            "adapter_sha256": result["teacher"]["adapter_sha256"],
        }

    serial = []
    for model in models:
        serial.append(request(model, samples[0]))
        print(json.dumps(serial[-1]), flush=True)
    adapters = [m for m in models if m["kind"] == "lora"][:2]
    assert len(adapters) == 2
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [
            pool.submit(request, adapters[i % 2], row) for i, row in enumerate(samples)
        ]
        concurrent = [future.result() for future in futures]
    result = {
        "family": args.family,
        "serial": serial,
        "concurrent": concurrent,
        "concurrency": 8,
        "concurrent_seconds": time.monotonic() - started,
    }
    Path(args.output).write_text(json.dumps(result, indent=2))
    print(
        json.dumps(
            {
                "family": args.family,
                "models": len(models),
                "concurrency": 8,
                "seconds": result["concurrent_seconds"],
                "status": "passed",
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
