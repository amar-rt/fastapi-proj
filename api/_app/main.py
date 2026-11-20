import logging

from urllib.parse import urlparse

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import DATABASE_URL, LLM_API_KEY
from .db import ensure_schema
from .routes import admin_routes, auth_routes, candidate_routes, interview_routes

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("l1")

app = FastAPI(title="AI-Assisted L1 Interview API", docs_url="/api/docs", openapi_url="/api/openapi.json")

for r in (auth_routes, admin_routes, candidate_routes, interview_routes):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    """Deployment self-check. Reports only booleans/status words, never secret values."""
    status = {"ok": True, "database_url_set": bool(DATABASE_URL), "llm_key_set": bool(LLM_API_KEY)}
    if DATABASE_URL:
        u = urlparse(DATABASE_URL)
        # Host and database name only (no user/password), to match against the Neon console.
        status["database_host"] = (u.hostname or "").split(".")[0]
        status["database_name"] = u.path.lstrip("/")
        try:
            with psycopg.connect(DATABASE_URL, connect_timeout=5, autocommit=True) as conn:
                ensure_schema(conn)
                ready = conn.execute("SELECT to_regclass('public.users') IS NOT NULL").fetchone()[0]
                users = conn.execute("SELECT count(*) FROM users").fetchone()[0] if ready else 0
            status["database"] = "ok" if ready else "connected, but tables missing"
            status["users"] = users
        except Exception as e:
            status["database"] = f"error: {type(e).__name__}: {str(e).splitlines()[0][:200]}"
    else:
        status["database"] = "DATABASE_URL not set"
    status["ok"] = status["database"] == "ok" and status["llm_key_set"]
    return status


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Server error, please retry"})
