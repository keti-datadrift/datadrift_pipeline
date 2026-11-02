"""Remove only the QA objects in an explicit browser-test receipt; retain evidence."""

import json
import shutil
import sys
from pathlib import Path

from backend.data import store as s

folder = Path(sys.argv[1]).resolve()
receipt = json.loads((folder / "receipt.json").read_text())
wid = receipt["workspace_id"]
ids = set(receipt["datasets"])
jids = set(receipt["jobs"])
with s.db() as con:
    con.execute("BEGIN IMMEDIATE")
    workspace = s.get("workspace", wid, con)
    assert workspace["name"] == "QA 이미지 업로드 검증"
    datasets = s.all_of("dataset", con)
    own = [d for d in datasets if d["workspace_id"] == wid]
    assert {d["id"] for d in own} == ids
    for d in datasets:
        assert d["id"] in ids or not (set(d.get("parent_ids", [])) & ids)
    jobs = s.all_of("job", con)
    for j in jobs:
        if j["id"] in jids:
            assert j["status"] in ("succeeded", "failed", "cancelled")
        elif (
            j["request"]["dataset_id"] in ids or j["request"].get("reference_id") in ids
        ):
            raise RuntimeError("A different job references this test dataset")
    assert not any(m.get("dataset_id") in ids for m in s.all_of("model", con))
    assets = {Path(r["image"]).parent for d in own for r in d["rows"]}
    for asset in assets:
        assert asset.parent == s.ROOT / "uploads"
    for did in ids:
        con.execute("DELETE FROM objects WHERE kind='dataset' AND id=?", (did,))
    for jid in jids:
        con.execute("DELETE FROM objects WHERE kind='job' AND id=?", (jid,))
    con.execute("DELETE FROM objects WHERE kind='workspace' AND id=?", (wid,))
for asset in assets:
    target = folder / "assets" / asset.name
    target.parent.mkdir(exist_ok=True)
    shutil.move(str(asset), str(target))
for jid in jids:
    source = s.ROOT / "jobs" / jid
    target = folder / "jobs" / jid
    target.parent.mkdir(exist_ok=True)
    if source.exists():
        shutil.move(str(source), str(target))
print(
    f"Removed QA workspace, {len(ids)} datasets, {len(jids)} jobs; evidence retained in {folder}"
)
