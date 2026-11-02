"""Remove only the browser test's own records; preserve uploaded files as evidence."""

import json
import shutil
from pathlib import Path

from backend.data import store as s

folder = Path(".runtime/deletion-verification").resolve()
receipt = json.loads((folder / "receipt.json").read_text())
wid = receipt["workspace_id"]
dataset_ids = set(receipt["datasets"])
batches = set(receipt["batches"])
assets = set()
with s.db() as con:
    con.execute("BEGIN IMMEDIATE")
    workspace_rows = list(
        con.execute(
            "SELECT body FROM objects WHERE kind='workspace' AND id=? UNION ALL SELECT body FROM deleted_objects WHERE kind='workspace' AND id=?",
            (wid, wid),
        )
    )
    assert (
        len(workspace_rows) == 1
        and json.loads(workspace_rows[0][0])["name"] == "QA 삭제 복원 검증"
    )
    for table in ("objects", "deleted_objects"):
        for row in con.execute(f"SELECT id, body FROM {table} WHERE kind='dataset'"):
            d = json.loads(row["body"])
            if d["workspace_id"] == wid:
                assert d["id"] in dataset_ids
                for sample in d["rows"]:
                    path = Path(sample["image"]).resolve()
                    assert path.is_relative_to(s.ROOT / "uploads")
                    assets.add(path.parent)
            else:
                assert d["id"] not in dataset_ids
    for job in s.all_of("job", con):
        assert not dataset_ids.intersection(
            {job["request"].get("dataset_id"), job["request"].get("reference_id")}
        )
    for model in s.all_of("model", con):
        assert model.get("dataset_id") not in dataset_ids
    for table in ("objects", "deleted_objects"):
        for row in con.execute(f"SELECT body FROM {table} WHERE kind='dataset'"):
            d = json.loads(row[0])
            if d["workspace_id"] != wid:
                assert all(
                    Path(r["image"]).resolve().parent not in assets for r in d["rows"]
                )
        for did in dataset_ids:
            con.execute(f"DELETE FROM {table} WHERE kind='dataset' AND id=?", (did,))
        con.execute(f"DELETE FROM {table} WHERE kind='workspace' AND id=?", (wid,))
    for bid in batches:
        row = con.execute(
            "SELECT body FROM deletion_batches WHERE id=?", (bid,)
        ).fetchone()
        if row:
            assert json.loads(row[0])["workspace_id"] == wid
            con.execute("DELETE FROM deletion_batches WHERE id=?", (bid,))
for asset in assets:
    if asset.exists():
        destination = folder / "assets" / asset.name
        destination.parent.mkdir(exist_ok=True)
        shutil.move(str(asset), str(destination))
print(
    "Cleaned only owned QA workspace, datasets and deletion batches; files retained under",
    folder,
)
