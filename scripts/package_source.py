"""Package application sources and configuration, with optional service units."""

import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

SOURCE_DIRS = ("backend", "src")
SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"}
ROOT_SOURCES = ("next.config.ts", "postcss.config.mjs")
SKIP_DIRS = {"__pycache__", "node_modules", "dist"}
PROJECT_FILES = (
    "backend/schemas/attribute_schema.json",
    "backend/schemas/bkave_taxonomy.json",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "requirements.txt",
    "requirements.lock.txt",
    "LICENSE",
)
SERVICE_FILES = (
    "deploy/datadrift-pipeline-api.service",
    "deploy/datadrift-pipeline-web.service",
    "deploy/datadrift-pipeline-worker.service",
    "deploy/datadrift-pipeline-vllm-runtime.service",
    "deploy/datadrift-pipeline-vllm-2b.service",
    "deploy/datadrift-pipeline-vllm-4b.service",
)
RUNTIME_FILES = PROJECT_FILES + SERVICE_FILES


def source_files(root, profile="source"):
    if profile not in ("source", "runnable"):
        raise ValueError(f"Unknown bundle profile: {profile}")
    root = Path(root).resolve()
    paths = []
    for name in SOURCE_DIRS:
        folder = root / name
        if not folder.is_dir():
            continue
        for path in folder.rglob("*"):
            relative = path.relative_to(root)
            if any(
                part.startswith(".") or part in SKIP_DIRS for part in relative.parts
            ):
                continue
            if path.suffix not in SOURCE_SUFFIXES:
                continue
            if path.is_symlink():
                raise ValueError(f"Symbolic links are not source copies: {relative}")
            if path.is_file():
                paths.append(path)
    for name in ROOT_SOURCES:
        path = root / name
        if path.is_symlink():
            raise ValueError(f"Symbolic links are not source copies: {name}")
        if path.is_file():
            paths.append(path)
    required = RUNTIME_FILES if profile == "runnable" else PROJECT_FILES
    for name in required:
        path = root / name
        if path.is_symlink():
            raise ValueError(f"Symbolic links are not source copies: {name}")
        if not path.is_file():
            raise ValueError(f"Required package file is missing: {name}")
        paths.append(path)
    return sorted(paths, key=lambda path: path.relative_to(root).as_posix())


def build_bundle(root, output, *, profile="source"):
    root, output = Path(root).resolve(), Path(output).resolve()
    entries = []
    for path in source_files(root, profile):
        data = path.read_bytes()
        data.decode("utf-8")
        entries.append(
            {
                "path": path.relative_to(root).as_posix(),
                "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        )
    if not entries:
        raise ValueError("No core application source files found")
    fingerprint = hashlib.sha256(
        "".join(f"{e['path']}\0{e['sha256']}\n" for e in entries).encode()
    ).hexdigest()
    output.mkdir(parents=True, exist_ok=True)
    kind = "submission" if profile == "source" else "runnable"
    copied = output / (kind + "-source-" + fingerprint[:12])
    archive_path = output / (f"datadrift_{kind}_source_" + fingerprint[:12] + ".zip")
    # Each source snapshot has its own folder; existing user files are never cleared.
    copied.mkdir(exist_ok=True)
    for entry in entries:
        source = root / entry["path"]
        destination = copied / entry["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if (
            destination.exists()
            and hashlib.sha256(destination.read_bytes()).hexdigest() != entry["sha256"]
        ):
            raise ValueError(f"An existing source copy was modified: {destination}")
        shutil.copyfile(source, destination)
    with zipfile.ZipFile(
        archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        for entry in entries:
            data = (copied / entry["path"]).read_bytes()
            if hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError(f"Source changed while packaging: {entry['path']}")
            item = zipfile.ZipInfo(entry["path"], date_time=(1980, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.create_system = 3
            item.external_attr = 0o100644 << 16
            archive.writestr(
                item, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9
            )
    checksum = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    manifest = {
        "profile": profile,
        "archive": archive_path.name,
        "sha256": checksum,
        "source_fingerprint": fingerprint,
        "source_copy": copied.name,
        "file_count": len(entries),
        "files": entries,
    }
    manifest_path = archive_path.with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    archive_path.with_suffix(".sha256").write_text(f"{checksum}  {archive_path.name}\n")
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:
            raise ValueError("ZIP integrity check failed")
        if archive.namelist() != [entry["path"] for entry in entries]:
            raise ValueError("ZIP content list differs from the source manifest")
        for entry in entries:
            if (
                hashlib.sha256(archive.read(entry["path"])).hexdigest()
                != entry["sha256"]
            ):
                raise ValueError(f"ZIP content hash differs: {entry['path']}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--output", type=Path, default=Path("dist/submission"))
    parser.add_argument("--profile", choices=("source", "runnable"), default="source")
    args = parser.parse_args()
    manifest = build_bundle(args.root, args.output, profile=args.profile)
    print(
        json.dumps(
            {
                key: manifest[key]
                for key in ("archive", "source_copy", "file_count", "sha256")
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
