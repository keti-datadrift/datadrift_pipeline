"""Reconcile published API demand with this project's two systemd vLLM units."""

import fcntl
import os
import subprocess
import time

import httpx

from backend.catalog import model_available
from backend.data import store as s

UNITS = {
    "qwen35_2b": ("datadrift-pipeline-vllm-2b.service", "http://127.0.0.1:18093"),
    "qwen35_4b": ("datadrift-pipeline-vllm-4b.service", "http://127.0.0.1:18094"),
}
FRESH_SECONDS = 15
RETRY_SECONDS = 30
START_TIMEOUT = 600


def managed():
    return os.environ.get("DATADRIFT_VLLM_MANAGED") == "1"


def demand(con):
    targets = {
        family: {"enabled_endpoints": 0, "active_requests": 0} for family in UNITS
    }
    models = {m["id"]: m for m in s.all_of("model", con)}
    for endpoint in s.all_of("model_endpoint", con):
        model = models.get(endpoint["model_id"], {})
        family = model.get("family")
        if (
            endpoint["enabled"]
            and family in targets
            and model.get("status") == "ready"
            and model_available(model)
        ):
            targets[family]["enabled_endpoints"] += 1
    jobs = con.execute("""SELECT json_extract(body, '$.request.model_id'), count(*)
        FROM objects WHERE kind='job' AND json_extract(body, '$.request.kind')='inference'
        AND json_extract(body, '$.status') IN ('queued','running')
        GROUP BY json_extract(body, '$.request.model_id')""")
    for model_id, count in jobs:
        family = models.get(model_id, {}).get("family")
        if family in targets:
            targets[family]["active_requests"] += count
    return targets


def systemd_status(family):
    result = subprocess.run(
        [
            "systemctl",
            "--user",
            "show",
            UNITS[family][0],
            "--property=LoadState,ActiveState,SubState,Result",
        ],
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
    )
    fields = dict(
        line.split("=", 1) for line in result.stdout.splitlines() if "=" in line
    )
    if fields.get("LoadState") != "loaded":
        raise RuntimeError(f"서비스를 찾을 수 없습니다: {UNITS[family][0]}")
    return fields


def healthy(family):
    try:
        with httpx.Client(trust_env=False, timeout=0.5) as client:
            response = client.get(UNITS[family][1] + "/v1/models")
            response.raise_for_status()
            return family in {m["id"] for m in response.json()["data"]}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return False


def control(family, action):
    # No unit names or shell commands supplied by API callers are accepted.
    result = subprocess.run(
        ["systemctl", "--user", "--no-block", action, UNITS[family][0]],
        check=False,
        capture_output=True,
        text=True,
        timeout=5,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[:400] or f"vLLM {action} 실패")
    print(f"{family}: systemctl {action}", flush=True)


def runtime_records(con):
    return {r["id"]: r for r in s.all_of("model_runtime", con)}


def endpoint_runtime(endpoint, model, targets=None, records=None):
    if not managed() or not model or model.get("family") not in UNITS:
        return None
    if targets is None or records is None:
        with s.db() as con:
            con.execute("BEGIN")
            targets, records = demand(con), runtime_records(con)
    family = model["family"]
    target, record = targets[family], records.get(family, {})
    state, error = record.get("state", "unknown"), record.get("error")
    wanted = bool(target["enabled_endpoints"] or target["active_requests"])
    if time.time() - record.get("checked_at", 0) > FRESH_SECONDS:
        state, error = "unknown", "vLLM 실행 관리자 응답을 확인할 수 없습니다."
    elif wanted and state in ("stopped", "stopping"):
        state = "waiting"
    elif not wanted and state in ("ready", "starting", "waiting"):
        state = "stopping"
    if (
        not endpoint["enabled"]
        and not target["enabled_endpoints"]
        and target["active_requests"]
        and state not in ("error", "unknown")
    ):
        state = "draining"
    return {
        "state": state,
        "error": error,
        "family": family,
        **target,
        "shared": not endpoint["enabled"] and target["enabled_endpoints"] > 0,
    }


def is_ready(family):
    if not managed():
        return True
    try:
        record = s.get("model_runtime", family)
    except KeyError:
        return False
    return (
        record["state"] == "ready"
        and time.time() - record["checked_at"] <= FRESH_SECONDS
    )


def reconcile():
    observed, health, failures = {}, {}, {}
    for family in UNITS:
        try:
            observed[family] = systemd_status(family)
            health[family] = observed[family]["ActiveState"] == "active" and healthy(
                family
            )
        except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
            failures[family] = str(exc)
    now = time.time()
    with s.db() as con:
        # Serialize the final demand check and no-block systemd command with
        # reception toggles/enqueue. Never stop a server with accepted work.
        con.execute("BEGIN IMMEDIATE")
        targets, previous = demand(con), runtime_records(con)
        records = {}
        for family, target in targets.items():
            old = previous.get(family, {})
            info = observed.get(family, {})
            active = info.get("ActiveState")
            state = (
                "error"
                if family in failures
                else "ready"
                if health[family]
                else "starting"
                if active in ("active", "activating")
                else "stopping"
                if active == "deactivating"
                else "error"
                if active == "failed"
                else "stopped"
            )
            since = old.get("starting_since", now) if state == "starting" else now
            error = failures.get(family)
            if active == "failed" or info.get("SubState") == "auto-restart":
                state = "error"
                error = f"vLLM 서비스 실행 실패 ({info.get('Result', 'unknown')})"
            if (
                active == "inactive"
                and old.get("error")
                and now - old.get("last_start_attempt", 0) < RETRY_SECONDS
            ):
                state, error = "error", old["error"]
            if state == "starting" and now - since > START_TIMEOUT:
                state, error = (
                    "error",
                    "vLLM 모델 로딩이 10분 이상 지연되고 있습니다. 서비스 로그를 확인하세요.",
                )
            records[family] = {
                "id": family,
                "state": state,
                "error": error,
                **target,
                "checked_at": now,
                "updated_at": s.now(),
                "starting_since": since,
                "last_start_attempt": old.get("last_start_attempt", 0),
            }
        # Start one engine at a time: concurrent allocation corrupts vLLM's
        # shared-GPU memory profiling. Also wait for any stop to release memory.
        loading = {
            f
            for f, info in observed.items()
            if info["ActiveState"] in ("active", "activating") and not health.get(f)
        }
        transitioning = bool(
            failures
            or loading
            or any(info["ActiveState"] == "deactivating" for info in observed.values())
        )
        for family, record in records.items():
            wanted = record["enabled_endpoints"] or record["active_requests"]
            active = observed.get(family, {}).get("ActiveState")
            if (
                not wanted
                and active in ("active", "activating", "failed")
                and not (loading - {family})
            ):
                record.update(state="stopping", error=None)
                # Persist the gate before stop; newly enabled requests must wait
                # through deactivation rather than use the departing HTTP server.
                s.save("model_runtime", record, con)
                try:
                    control(family, "stop")
                    transitioning = True
                except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
                    record.update(state="error", error=str(exc))
        for family in sorted(UNITS, key=lambda f: -targets[f]["active_requests"]):
            record = records[family]
            wanted = record["enabled_endpoints"] or record["active_requests"]
            active = observed.get(family, {}).get("ActiveState")
            if wanted and active in ("inactive", "failed"):
                if transitioning:
                    record["state"] = "waiting"
                elif now - record["last_start_attempt"] >= RETRY_SECONDS:
                    record.update(
                        state="starting",
                        error=None,
                        starting_since=now,
                        last_start_attempt=now,
                    )
                    try:
                        control(family, "start")
                        transitioning = True
                    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
                        record.update(state="error", error=str(exc))
        for record in records.values():
            s.save("model_runtime", record, con)


def main():
    s.ROOT.mkdir(parents=True, exist_ok=True)
    with (s.ROOT / "vllm-runtime.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        while True:
            reconcile()
            time.sleep(1)


if __name__ == "__main__":
    main()
