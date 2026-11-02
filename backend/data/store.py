"""Durable single-host catalog and job queue (SQLite WAL)."""

import contextlib
import json
import os
import sqlite3
import uuid
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(os.environ.get("DATADRIFT_STATE", ".runtime")).resolve()


def now():
    return datetime.now(UTC).isoformat()


def uid():
    return uuid.uuid4().hex


@contextlib.contextmanager
def db():
    ROOT.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(ROOT / "catalog.sqlite", timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute(
        "CREATE TABLE IF NOT EXISTS objects (kind TEXT, id TEXT, body TEXT, PRIMARY KEY(kind,id))"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS deletion_batches (id TEXT PRIMARY KEY, body TEXT NOT NULL)"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS deleted_objects (kind TEXT, id TEXT, batch_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id))"
    )
    con.execute(
        "CREATE TABLE IF NOT EXISTS workspace_data (workspace_id TEXT PRIMARY KEY, dataset_id TEXT)"
    )
    try:
        yield con
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()


def save(kind, value, con=None):
    if con is None:
        with db() as c:
            return save(kind, value, c)
    if con.execute(
        "SELECT 1 FROM deleted_objects WHERE kind=? AND id=?", (kind, value["id"])
    ).fetchone():
        raise ValueError("삭제 목록에 있는 항목입니다. 먼저 복원하세요.")
    if kind == "dataset":
        value["unlabeled_count"] = sum(
            r.get("label_state") == "unlabeled" for r in value["rows"]
        )
        value["labeled_count"] = len(value["rows"]) - value["unlabeled_count"]
    con.execute(
        "INSERT INTO objects VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
        (kind, value["id"], json.dumps(value, ensure_ascii=False)),
    )
    return value


def get(kind, key, con=None):
    if con is None:
        with db() as c:
            return get(kind, key, c)
    row = con.execute(
        "SELECT body FROM objects WHERE kind=? AND id=?", (kind, key)
    ).fetchone()
    if row is None:
        raise KeyError(f"{kind} not found: {key}")
    return json.loads(row["body"])


def all_of(kind, con=None):
    if con is None:
        with db() as c:
            return all_of(kind, c)
    return [
        json.loads(r["body"])
        for r in con.execute(
            "SELECT body FROM objects WHERE kind=? ORDER BY rowid DESC", (kind,)
        )
    ]


def patch(kind, key, **fields):
    with db() as c:
        c.execute("BEGIN IMMEDIATE")
        obj = get(kind, key, c)
        obj.update(fields)
        return save(kind, obj, c)


def rows(dataset):
    return dataset["rows"]


def counts(dataset):
    from collections import Counter

    return dict(Counter(r["split"] for r in rows(dataset)))


def public_dataset(d):
    return {k: v for k, v in d.items() if k != "rows"} | {
        "count": len(d["rows"]),
        "splits": counts(d),
        "reviewed_count": sum(
            bool(r.get("human_verified")) and r.get("label_state") != "unlabeled"
            for r in d["rows"]
        ),
        "unlabeled_count": sum(r.get("label_state") == "unlabeled" for r in d["rows"]),
        "labeled_count": sum(r.get("label_state") != "unlabeled" for r in d["rows"]),
    }


def initialize_read_indexes():
    """Derived indexes; triggers keep API, worker and direct SQL writes consistent."""
    summary = """json_set(json_remove(new.body, '$.rows'),
        '$.count', json_array_length(new.body, '$.rows'),
        '$.reviewed_count', (SELECT count(*) FROM json_each(new.body, '$.rows') WHERE json_extract(value, '$.human_verified')=1 AND coalesce(json_extract(value, '$.label_state'), 'labeled')!='unlabeled'),
        '$.unlabeled_count', (SELECT count(*) FROM json_each(new.body, '$.rows') WHERE json_extract(value, '$.label_state')='unlabeled'),
        '$.labeled_count', (SELECT count(*) FROM json_each(new.body, '$.rows') WHERE coalesce(json_extract(value, '$.label_state'), 'labeled')!='unlabeled'),
        '$.splits', json((SELECT json_group_object(split, n) FROM (
            SELECT json_extract(value, '$.split') AS split, count(*) AS n
            FROM json_each(new.body, '$.rows') GROUP BY split))))"""
    with db() as c:
        c.execute(
            "CREATE TABLE IF NOT EXISTS dataset_summaries (id TEXT PRIMARY KEY, body TEXT NOT NULL)"
        )
        c.execute("""CREATE TABLE IF NOT EXISTS dataset_images (
            dataset_id TEXT, sample_id TEXT, image TEXT,
            PRIMARY KEY(dataset_id, sample_id))""")
        c.execute("""CREATE TRIGGER IF NOT EXISTS workspace_data_delete AFTER DELETE ON objects BEGIN
            DELETE FROM workspace_data WHERE old.kind='workspace' AND workspace_id=old.id;
            UPDATE workspace_data SET dataset_id=NULL WHERE old.kind='dataset' AND dataset_id=old.id;
            END""")
        changed = False
        for event in ("INSERT", "UPDATE"):
            trigger_name = "dataset_index_" + event.lower()
            old = c.execute(
                "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
                (trigger_name,),
            ).fetchone()
            if old and "$.reviewed_count" not in old[0]:
                c.execute(f"DROP TRIGGER {trigger_name}")
                changed = True
            c.execute(f"""CREATE TRIGGER IF NOT EXISTS dataset_index_{event.lower()}
                AFTER {event} ON objects WHEN new.kind='dataset' BEGIN
                DELETE FROM dataset_summaries WHERE id=new.id;
                INSERT INTO dataset_summaries VALUES (new.id, {summary});
                DELETE FROM dataset_images WHERE dataset_id=new.id;
                INSERT INTO dataset_images
                    SELECT new.id, json_extract(value, '$.id'), json_extract(value, '$.image')
                    FROM json_each(new.body, '$.rows') WHERE true
                    ON CONFLICT(dataset_id, sample_id) DO NOTHING;
                END""")
        c.execute("""CREATE TRIGGER IF NOT EXISTS dataset_index_delete
            AFTER DELETE ON objects WHEN old.kind='dataset' BEGIN
            DELETE FROM dataset_summaries WHERE id=old.id;
            DELETE FROM dataset_images WHERE dataset_id=old.id;
            END""")
        if changed:
            c.execute("UPDATE objects SET body=body WHERE kind='dataset'")
        c.execute("""INSERT OR IGNORE INTO workspace_data
            SELECT w.id, (SELECT d.id FROM objects d WHERE d.kind='dataset'
                AND json_extract(d.body, '$.workspace_id')=w.id
                ORDER BY json_extract(d.body, '$.created_at') DESC, d.rowid DESC LIMIT 1)
            FROM objects w WHERE w.kind='workspace'""")
        # Backfill existing catalogs through the same transaction/trigger path.
        c.execute("""UPDATE objects SET body=body WHERE kind='dataset'
            AND id NOT IN (SELECT id FROM dataset_summaries)""")


def dataset_summaries(workspace_id=None, dataset_id=None, current_only=False):
    with db() as c:
        rows = c.execute(
            """SELECT d.body FROM dataset_summaries d
            JOIN objects o ON o.kind='dataset' AND o.id=d.id
            WHERE (? IS NULL OR json_extract(d.body, '$.workspace_id')=?)
              AND (? IS NULL OR d.id=?)
              AND (?=0 OR EXISTS(SELECT 1 FROM workspace_data h WHERE h.dataset_id=d.id)) ORDER BY o.rowid DESC""",
            (workspace_id, workspace_id, dataset_id, dataset_id, int(current_only)),
        )
        return [json.loads(r["body"]) for r in rows]


def image_path(dataset_id, sample_id):
    with db() as c:
        row = c.execute(
            "SELECT image FROM dataset_images WHERE dataset_id=? AND sample_id=?",
            (dataset_id, sample_id),
        ).fetchone()
    if row is None or not row["image"]:
        raise KeyError(f"Image not found: {sample_id}")
    return row["image"]


def job_summaries(kind=None):
    with db() as c:
        return [
            json.loads(r[0])
            for r in c.execute(
                """
            SELECT json_remove(body, '$.result', '$.progress.history', '$.input_row') FROM objects
            WHERE kind='job' AND (? IS NULL OR json_extract(body, '$.request.kind')=?)
            ORDER BY rowid DESC""",
                (kind, kind),
            )
        ]
