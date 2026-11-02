"""Fixed, CPU-only ImageNet ResNet18 embeddings with content-addressed caching."""

import hashlib
import io
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

WEIGHTS_SHA256 = "f37072fd47e89c5e827621c5baffa7500819f7896bbacec160b1a16c560e07ec"


def extract(rows, cache, report):
    import torch
    import torchvision
    from torchvision.models import ResNet18_Weights, resnet18

    torch.set_num_threads(min(8, os.cpu_count() or 1))
    weights = ResNet18_Weights.IMAGENET1K_V1
    checkpoint = Path(torch.hub.get_dir()) / "checkpoints/resnet18-f37072fd.pth"
    if not checkpoint.is_file():
        raise RuntimeError(
            "이미지 특징 모델 파일이 없습니다. 운영 문서의 ResNet18 가중치 준비 절차를 확인하세요."
        )
    digest = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if digest != WEIGHTS_SHA256:
        raise RuntimeError("이미지 특징 모델 가중치 해시가 일치하지 않습니다.")
    version = f"resnet18-imagenet1k-v1:{digest}:exif-rgb-resize256-crop224-l2:v1:{torch.__version__}:{torchvision.__version__}"
    folder = Path(cache) / hashlib.sha256(version.encode()).hexdigest()
    folder.mkdir(parents=True, exist_ok=True)
    vectors = [None] * len(rows)
    missing = []
    for i, row in enumerate(rows):
        raw = Path(row["image"]).read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        if row.get("sha256") and row["sha256"] != sha:
            raise ValueError("이미지 파일이 저장된 해시와 다릅니다.")
        destination = folder / (sha + ".npy")
        try:
            vector = np.load(destination, allow_pickle=False)
            if vector.shape != (512,) or not np.isfinite(vector).all():
                raise ValueError("Invalid embedding cache")
            vectors[i] = vector
        except (OSError, ValueError):
            missing.append((i, raw, destination))
    report(
        "loading_image_encoder" if missing else "embedding_images",
        len(rows) - len(missing),
        len(rows),
    )
    if missing:
        model = resnet18(weights=None)
        model.load_state_dict(
            torch.load(checkpoint, map_location="cpu", weights_only=True)
        )
        model.fc = torch.nn.Identity()
        model.eval().requires_grad_(False)
        transform = weights.transforms()
        with torch.inference_mode():
            for offset in range(0, len(missing), 16):
                batch = missing[offset : offset + 16]
                tensors = []
                for _, raw, _ in batch:
                    with Image.open(io.BytesIO(raw)) as image:
                        tensors.append(
                            transform(ImageOps.exif_transpose(image).convert("RGB"))
                        )
                encoded = torch.nn.functional.normalize(
                    model(torch.stack(tensors)), dim=1
                ).numpy()
                for (index, _, path), vector in zip(batch, encoded, strict=True):
                    vectors[index] = vector
                    temporary = path.with_suffix(f".{os.getpid()}.tmp")
                    with temporary.open("wb") as output:
                        np.save(output, vector, allow_pickle=False)
                    temporary.replace(path)
                report(
                    "embedding_images",
                    len(rows) - len(missing) + min(offset + 16, len(missing)),
                    len(rows),
                )
    return np.asarray(vectors), {
        "encoder": "ResNet18 ImageNet-1K V1",
        "weights_sha256": digest,
        "feature_version": version,
        "dimensions": 512,
        "device": "cpu",
        "cache_hits": len(rows) - len(missing),
        "encoded_images": len(missing),
    }
