"""Thin psycopg helpers. Serverless functions are short-lived, so each request opens one
connection to Neon's pooled endpoint (PgBouncer) and closes it at the end.

Autocommit is on: each statement is durable immediately, so nothing depends on the request
cleanup running after the response (serverless runtimes may freeze before that). Multi-statement
work that must be atomic uses `with conn.transaction():`."""
import logging
import pathlib
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import DATABASE_URL

__all__ = ["get_conn", "Jsonb", "fetch_all", "fetch_one", "execute", "ensure_schema"]

SCHEMA_FILE = pathlib.Path(__file__).with_name("schema.sql")
_schema_ready = False  # checked once per warm serverless instance


def ensure_schema(conn: psycopg.Connection) -> None:
    """Create the tables on first use if they don't exist. schema.sql is idempotent."""
    global _schema_ready
    if _schema_ready:
        return
    row = conn.execute("SELECT to_regclass('public.users') IS NOT NULL AS ready").fetchone()
    ready = row["ready"] if isinstance(row, dict) else row[0]
    if not ready:
        logging.getLogger("l1").warning("Tables missing; applying schema.sql")
        conn.execute(SCHEMA_FILE.read_text(encoding="utf-8"))
    _schema_ready = True


@contextmanager
def _connect() -> Iterator[psycopg.Connection]:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    # prepare_threshold=None: prepared statements don't survive PgBouncer transaction pooling
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row, prepare_threshold=None, autocommit=True)
    try:
        ensure_schema(conn)
        yield conn
    finally:
        conn.close()


def get_conn() -> Iterator[psycopg.Connection]:
    """FastAPI dependency: one connection per request."""
    with _connect() as conn:
        yield conn


def fetch_all(conn: psycopg.Connection, sql: str, params: Any = None) -> list[dict]:
    return conn.execute(sql, params).fetchall()


def fetch_one(conn: psycopg.Connection, sql: str, params: Any = None) -> dict | None:
    return conn.execute(sql, params).fetchone()


def execute(conn: psycopg.Connection, sql: str, params: Any = None) -> None:
    conn.execute(sql, params)


def audit(conn: psycopg.Connection, user_id: str | None, action: str, entity: str,
          entity_id: Any = None, ip: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (user_id, action, entity, entity_id, ip) VALUES (%s,%s,%s,%s,%s)",
        (user_id, action, entity, str(entity_id) if entity_id else None, ip),
    )
