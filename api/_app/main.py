import logging

from urllib.parse import urlparse

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import DATABASE_URL, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_FAST, LLM_MODEL_MAIN, STT_MODEL
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

    # Verify the LLM key with the provider's free model-list call (no tokens used).
    # Shows only the first 4 chars and the length of the key.
    status["llm_base_url"] = LLM_BASE_URL
    status["llm_key_hint"] = f"{LLM_API_KEY[:4]}… ({len(LLM_API_KEY)} chars)" if LLM_API_KEY else None
    if LLM_API_KEY:
        try:
            from .llm import client
            available = {m.id for m in client().models.list()}
            missing = [m for m in (LLM_MODEL_MAIN, LLM_MODEL_FAST, STT_MODEL) if m not in available]
            status["llm"] = "ok" if not missing else f"key ok, models not available: {', '.join(missing)}"
        except Exception as e:
            status["llm"] = f"error: {str(e)[:200]}"
    else:
        status["llm"] = "LLM_API_KEY not set"
    status["ok"] = status["database"] == "ok" and status["llm"] == "ok"
    return status


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Server error, please retry"})
