import hashlib
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from scripts.package_source import (
    PROJECT_FILES,
    RUNTIME_FILES,
    SERVICE_FILES,
    build_bundle,
)


def fixture_source(tmp_path):
    root = tmp_path / "project"
    for name, text in {
        "backend/api.py": "app = None\n",
        "src/app/page.tsx": "export default function Page(){return null;}\n",
        "src/app/globals.css": "body {margin:0;}\n",
        "next.config.ts": "export default {};\n",
        "README.md": "Documentation must stay outside the ZIP.\n",
        "backend/catalog.sqlite": "runtime database",
        "backend/schema.json": "{}",
        "src/.env": "PRIVATE=example",
        ".runtime/private.py": "private",
        "tests/test_feature.py": "pass",
    }.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    for name in PROJECT_FILES:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("project configuration\n")
    return root


def test_submission_includes_project_configuration_and_keeps_originals(tmp_path):
    root = fixture_source(tmp_path)
    output = tmp_path / "submission"
    manifest = build_bundle(root, output)
    assert manifest["file_count"] == 4 + len(PROJECT_FILES)
    with zipfile.ZipFile(output / manifest["archive"]) as archive:
        assert set(archive.namelist()) == {
            "backend/api.py",
            "next.config.ts",
            "src/app/globals.css",
            "src/app/page.tsx",
            *PROJECT_FILES,
        }
        assert not set(SERVICE_FILES) & set(archive.namelist())
        for entry in manifest["files"]:
            assert archive.read(entry["path"]) == (root / entry["path"]).read_bytes()
            assert (
                output / manifest["source_copy"] / entry["path"]
            ).read_bytes() == archive.read(entry["path"])
    assert (
        hashlib.sha256((output / manifest["archive"]).read_bytes()).hexdigest()
        == manifest["sha256"]
    )
    saved = json.loads(
        (output / manifest["archive"]).with_suffix(".manifest.json").read_text()
    )
    assert saved == manifest


def test_same_sources_produce_the_same_zip(tmp_path):
    root = fixture_source(tmp_path)
    a = build_bundle(root, tmp_path / "a")
    b = build_bundle(root, tmp_path / "b")
    assert a["sha256"] == b["sha256"]
    assert (tmp_path / "a" / a["archive"]).read_bytes() == (
        tmp_path / "b" / b["archive"]
    ).read_bytes()


def test_source_symlink_cannot_copy_files_from_outside_the_project(tmp_path):
    root = fixture_source(tmp_path)
    outside = tmp_path / "outside.py"
    outside.write_text("private")
    (root / "backend" / "outside.py").symlink_to(outside)
    with pytest.raises(ValueError, match="Symbolic links"):
        build_bundle(root, tmp_path / "out")


@pytest.mark.parametrize(
    "name", ["package-lock.json", "backend/schemas/bkave_taxonomy.json"]
)
def test_submission_requires_dependency_locks_and_schemas(tmp_path, name):
    root = fixture_source(tmp_path)
    (root / name).unlink()
    with pytest.raises(ValueError, match="Required package file is missing"):
        build_bundle(root, tmp_path / "out")


def test_runnable_bundle_includes_required_files_but_excludes_documents(tmp_path):
    root = fixture_source(tmp_path)
    for name in RUNTIME_FILES:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("runtime configuration\n")
    output = tmp_path / "submission"
    manifest = build_bundle(root, output, profile="runnable")
    with zipfile.ZipFile(output / manifest["archive"]) as archive:
        names = set(archive.namelist())
        assert set(RUNTIME_FILES) <= names
        assert "backend/api.py" in names
        assert "README.md" not in names
        assert "backend/catalog.sqlite" not in names
        assert "tests/test_feature.py" not in names


def test_runnable_bundle_refuses_to_omit_required_configuration(tmp_path):
    root = fixture_source(tmp_path)
    with pytest.raises(ValueError, match="Required package file is missing"):
        build_bundle(root, tmp_path / "submission", profile="runnable")


@pytest.mark.parametrize("profile", ["source", "runnable"])
def test_bundle_imports_entrypoints_and_nested_schemas(tmp_path, profile):
    root = Path(__file__).resolve().parents[1]
    output = tmp_path / "submission"
    manifest = build_bundle(root, output, profile=profile)
    extracted = tmp_path / "extracted"
    with zipfile.ZipFile(output / manifest["archive"]) as archive:
        archive.extractall(extracted)
    code = """
import importlib
import pathlib
import sys

root = pathlib.Path.cwd()
for name in (
    'backend.api', 'backend.worker', 'backend.catalog',
    'backend.training', 'backend.relabeling', 'backend.vllm_runtime',
    'backend.migrate_taxonomy', 'backend.standardize_catalog',
    'backend.jobs.drift',
):
    module = importlib.import_module(name)
    assert pathlib.Path(module.__file__).is_relative_to(root), name

from backend.api import Reconstruction, app, reconstruct
from backend.catalog import model_path
from backend.relabeling import TEACHER
from backend.schemas import taxonomy

assert callable(reconstruct)
assert Reconstruction.__name__ == 'Reconstruction'
assert taxonomy.schema()
assert taxonomy.LEGACY_SCHEMA
assert model_path('qwen35_2b') == root / 'models/Qwen3.5-2B'
assert TEACHER == root / 'models/gemma-4-12B-it'
assert '/api/workspaces' in app.openapi()['paths']
assert '/api/model-endpoints' in app.openapi()['paths']
assert 'torch' not in sys.modules
"""
    subprocess.run(
        [sys.executable, "-c", code],
        cwd=extracted,
        env=os.environ
        | {"PYTHONPATH": str(extracted), "DATADRIFT_MODELS": str(extracted / "models")},
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
