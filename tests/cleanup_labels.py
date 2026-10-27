"""Clean only a successful annotation test's isolated workspace and versions."""

import json
from pathlib import Path
from backend import store as s

path = Path(".runtime/ui-verification/labels.json")
report = json.loads(path.read_text())
assert report["status"] == "passed"
wid, ids = report["workspaceId"], set(report["datasets"])
with s.db() as c:
    c.execute("BEGIN IMMEDIATE")
    assert s.get("workspace", wid, c)["name"].startswith("QA 레이블 편집 ")
    datasets = s.all_of("dataset", c)
    assert {d["id"] for d in datasets if d["workspace_id"] == wid} == ids
    assert all(
        not (ids & set(d.get("parent_ids", []))) for d in datasets if d["id"] not in ids
    )
    assert all(
        not (ids & {j["request"]["dataset_id"], j["request"].get("reference_id")})
        for j in s.all_of("job", c)
    )
    for did in ids:
        c.execute("DELETE FROM objects WHERE kind=? AND id=?", ("dataset", did))
    c.execute("DELETE FROM objects WHERE kind=? AND id=?", ("workspace", wid))
report["temporary_workspace_removed"] = True
path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(
    "Removed verified temporary annotation workspace and versions; source data unchanged."
)
