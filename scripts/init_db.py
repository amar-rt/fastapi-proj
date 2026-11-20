"""Apply api/_app/schema.sql to the database in DATABASE_URL.  Usage: python scripts/init_db.py"""
import os
import pathlib
import sys

import psycopg

url = os.environ.get("DATABASE_URL")
if not url:
    sys.exit("Set DATABASE_URL (Neon connection string) first.")
sql = (pathlib.Path(__file__).resolve().parent.parent / "api" / "_app" / "schema.sql").read_text(encoding="utf-8")
with psycopg.connect(url, autocommit=True) as conn:
    conn.execute(sql)
print("Schema applied.")
