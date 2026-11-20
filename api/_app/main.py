import logging

import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import DATABASE_URL, LLM_API_KEY
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
        try:
            with psycopg.connect(DATABASE_URL, connect_timeout=5) as conn:
                ready = conn.execute("SELECT to_regclass('public.users') IS NOT NULL").fetchone()[0]
            status["database"] = "ok" if ready else "connected, but tables missing: run db/schema.sql"
        except Exception as e:
            status["database"] = f"connection failed: {type(e).__name__}"
    else:
        status["database"] = "DATABASE_URL not set"
    status["ok"] = status["database"] == "ok" and status["llm_key_set"]
    return status


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Server error, please retry"})
