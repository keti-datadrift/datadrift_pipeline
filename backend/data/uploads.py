"""Image validation, deduplication and workspace uploads."""

import hashlib
import io
import json
import shutil
import tempfile
import warnings
from pathlib import Path

from PIL import Image

from backend.data import store as s
from backend.data import workspace_data as wd
from backend.schemas import taxonomy as t

MAX_BATCH = 100 * 1024 * 1024
MAX_IMAGE = 20 * 1024 * 1024
MAX_FILES = 200
MAX_PIXELS = 25_000_000
FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}


def empty_target(category, schema_id=t.CURRENT):
    return {
        key: []
        if key == "details"
        else "not_applicable"
        if values == ["not_applicable"]
        else "unknown"
        for key, values in t.schema(schema_id, category).items()
    }


def import_images(files, workspace_id, name, category, split):
    s.get("workspace", workspace_id)
    root = s.ROOT / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".staging-", dir=root) as tmp:
        stage, rows, hashes = Path(tmp), [], set()
        total = 0
        if not files or len(files) > MAX_FILES:
            raise ValueError("이미지를 1~200개 선택하세요.")
        for file in files:
            filename = (file.filename or "image").replace("\\", "/").split("/")[-1]
            filename = filename or "image"
            if len(filename) > 250:
                raise ValueError("파일 이름은 250자 이내로 입력하세요.")
            content = file.file.read(MAX_IMAGE + 1)
            total += len(content)
            if len(content) > MAX_IMAGE or total > MAX_BATCH:
                raise ValueError(
                    "이미지당 20MB, 한 번에 100MB까지 업로드할 수 있습니다."
                )
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(io.BytesIO(content)) as image:
                        suffix = FORMATS.get(image.format)
                        if (
                            not suffix
                            or image.width * image.height > MAX_PIXELS
                            or getattr(image, "n_frames", 1) != 1
                        ):
                            raise ValueError("Unsupported image")
                        image.verify()
                    with Image.open(io.BytesIO(content)) as image:
                        image.load()
            except (
                OSError,
                ValueError,
                SyntaxError,
                Image.DecompressionBombWarning,
                Image.DecompressionBombError,
            ) as exc:
                raise ValueError(
                    f"{filename}: JPEG, PNG, WebP 단일 이미지인지 확인하세요. 최대 2,500만 화소까지 지원합니다."
                ) from exc
            digest = hashlib.sha256(content).hexdigest()
            if digest in hashes:
                continue
            hashes.add(digest)
            asset = digest + suffix
            (stage / asset).write_bytes(content)
            rows.append(
                {
                    "id": "upload-" + digest[:20],
                    "product_id": filename,
                    "image": asset,
                    "sha256": digest,
                    "source": workspace_id,
                    "split": split,
                    "category": category,
                    "schema_id": t.CURRENT,
                    "uploaded_at": s.now(),
                    "target": empty_target(category),
                    "label_state": "unlabeled",
                    "label_source": "미레이블",
                    "human_verified": False,
                    "unscored_fields": list(t.FIELDS),
                    "upload_filename": filename,
                }
            )
        rows.sort(key=lambda row: row["id"])
        fingerprint = hashlib.sha256(
            json.dumps(
                {"schema_id": t.CURRENT, "rows": rows},
                sort_keys=True,
                ensure_ascii=False,
            ).encode()
        ).hexdigest()
        destination = root / s.uid()
        with s.db() as con:
            con.execute("BEGIN IMMEDIATE")
            s.get("workspace", workspace_id, con)
            active = wd.current(workspace_id, con)
            known = {r["sha256"] for r in active["rows"]} if active else set()
            new_rows = [r for r in rows if r["sha256"] not in known]
            skipped = len(files) - len(new_rows)
            if not new_rows:
                return {
                    "dataset": s.public_dataset(active),
                    "duplicate": True,
                    "skipped_duplicates": skipped,
                }
            schema_id = active.get("schema_id", t.LEGACY) if active else t.CURRENT
            t.schema(schema_id)
            rows = new_rows
            for row in rows:
                row["schema_id"] = schema_id
                row["target"] = empty_target(category, schema_id)
                row["unscored_fields"] = list(row["target"])
            # A repeated batch is deduplicated against the current collection, not an old upload.
            dataset_id = "upload-" + s.uid()
            s.get("workspace", workspace_id, con)
            stage.rename(destination)
            try:
                for row in rows:
                    row["image"] = str(destination / row["image"])
                dataset = {
                    "id": dataset_id,
                    "workspace_id": workspace_id,
                    "name": name,
                    "created_at": s.now(),
                    "schema_id": t.CURRENT,
                    "rows": rows,
                    "fingerprint": fingerprint,
                    "kind": "upload",
                    "parent_ids": [],
                    "provenance": "이미지 업로드, 레이블 작성 전",
                }
                if active:
                    dataset = wd.revision(
                        active,
                        active["rows"] + rows,
                        kind="upload",
                        schema_id=schema_id,
                        provenance="이미지 추가",
                    )
                wd.publish(dataset, con)
                con.commit()
            except BaseException:
                shutil.rmtree(destination, ignore_errors=True)
                raise
        return {
            "dataset": s.public_dataset(dataset),
            "duplicate": False,
            "added_count": len(rows),
            "skipped_duplicates": skipped,
        }
