import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .routes import admin_routes, auth_routes, candidate_routes, interview_routes

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("l1")

app = FastAPI(title="AI-Assisted L1 Interview API", docs_url="/api/docs", openapi_url="/api/openapi.json")

for r in (auth_routes, admin_routes, candidate_routes, interview_routes):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Server error, please retry"})
