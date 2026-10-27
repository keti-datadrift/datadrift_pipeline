"""Remove only the workspace/dataset created by a successful local browser test.

Training/evaluation history and model artifacts are intentionally retained.
"""

import json
from pathlib import Path
from backend import store as s

path = Path(".runtime/ui-verification/workflows.json")
report = json.loads(path.read_text())
assert report["status"] == "passed"
wid, did = report["workspaceId"], report["reconstructionId"]
with s.db() as c:
    c.execute("BEGIN IMMEDIATE")
    workspace, dataset = s.get("workspace", wid, c), s.get("dataset", did, c)
    assert workspace["name"].startswith("QA 브라우저 검증 ")
    assert dataset["workspace_id"] == wid and dataset["name"] == "QA 재구성 저장 확인"
    assert {d["id"] for d in s.all_of("dataset", c) if d["workspace_id"] == wid} == {
        did
    }
    assert all(
        did not in [j["request"]["dataset_id"], j["request"].get("reference_id")]
        for j in s.all_of("job", c)
    )
    c.execute("DELETE FROM objects WHERE kind=? AND id=?", ("dataset", did))
    c.execute("DELETE FROM objects WHERE kind=? AND id=?", ("workspace", wid))
report["temporary_workspace_removed"] = True
path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(
    "Removed the verified temporary workspace and reconstruction; source data and job history retained."
)
