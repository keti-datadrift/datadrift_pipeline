"""Durable single-host catalog and job queue (SQLite WAL)."""

import contextlib
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("DATADRIFT_STATE", ".runtime")).resolve()


def now():
    return datetime.now(timezone.utc).isoformat()


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
    }
