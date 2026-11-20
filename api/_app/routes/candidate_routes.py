import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import client_ip, current_user, require_super
from ..config import MAX_UPLOAD_BYTES
from ..cv_parser import extract_text
from ..db import audit, fetch_all, fetch_one, get_conn

router = APIRouter(prefix="/api", tags=["candidates"])

LIST_SQL = """
SELECT i.id AS interview_id, i.status, i.created_at, i.ended_at, i.duration_min,
       c.id AS candidate_id, c.name, c.email,
       jd.id AS jd_id, jd.title AS role,
       u.id AS interviewer_id, u.name AS interviewer,
       pa.match_percent AS pre_match_percent,
       e.overall_score, e.match_percent, e.ai_recommendation, e.confidence,
       d.decision, d.overrides_ai, d.decided_at
FROM interviews i
JOIN candidates c ON c.id = i.candidate_id
JOIN job_descriptions jd ON jd.id = i.jd_id
LEFT JOIN users u ON u.id = i.interviewer_id
LEFT JOIN pre_interview_analysis pa ON pa.interview_id = i.id
LEFT JOIN evaluations e ON e.interview_id = i.id
LEFT JOIN LATERAL (
    SELECT decision, overrides_ai, decided_at FROM decisions
    WHERE interview_id = i.id ORDER BY decided_at DESC LIMIT 1
) d ON true
"""


def _query_candidates(conn, user: dict, f: dict) -> list[dict]:
    where, params = [], []
    if user["role"] != "super_user":
        where.append("i.interviewer_id = %s")
        params.append(user["id"])
    simple = {"jd_id": "i.jd_id", "interviewer_id": "i.interviewer_id", "status": "i.status", "decision": "d.decision",
              "recommendation": "e.ai_recommendation"}
    for key, col in simple.items():
        if f.get(key):
            where.append(f"{col} = %s")
            params.append(f[key])
    ranges = {"min_score": ("e.overall_score", ">="), "max_score": ("e.overall_score", "<="),
              "min_match": ("COALESCE(e.match_percent, pa.match_percent)", ">="),
              "max_match": ("COALESCE(e.match_percent, pa.match_percent)", "<="),
              "date_from": ("i.created_at::date", ">="), "date_to": ("i.created_at::date", "<=")}
    for key, (col, op) in ranges.items():
        if f.get(key) is not None:
            where.append(f"{col} {op} %s")
            params.append(f[key])
    if f.get("disagreement"):
        where.append("d.overrides_ai IS TRUE")
    if f.get("skill") and f.get("skill_min") is not None:
        where.append("EXISTS (SELECT 1 FROM jsonb_array_elements(e.skill_scores) s "
                     "WHERE s->>'skill' = %s AND (s->>'score') ~ '^[0-9.]+$' AND (s->>'score')::numeric >= %s)")
        params += [f["skill"], f["skill_min"]]
    if f.get("q"):
        where.append("(c.name ILIKE %s OR c.email ILIKE %s)")
        params += [f"%{f['q']}%"] * 2
    sql = LIST_SQL + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY i.created_at DESC LIMIT 1000"
    return fetch_all(conn, sql, params)


def _filters(jd_id: str | None = None, interviewer_id: str | None = None, status: str | None = None,
             decision: str | None = None, recommendation: str | None = None,
             min_score: float | None = None, max_score: float | None = None,
             min_match: int | None = None, max_match: int | None = None,
             date_from: date | None = None, date_to: date | None = None,
             disagreement: bool = False, skill: str | None = None, skill_min: float | None = None,
             q: str | None = None) -> dict:
    return locals()


@router.get("/candidates")
def list_candidates(f: dict = Depends(_filters), user=Depends(current_user), conn=Depends(get_conn)):
    return _query_candidates(conn, user, f)


@router.get("/candidates/export.csv")
def export_candidates(request: Request, f: dict = Depends(_filters), user=Depends(current_user), conn=Depends(get_conn)):
    rows = _query_candidates(conn, user, f)
    audit(conn, user["id"], "export", "candidates", f"{len(rows)} rows", client_ip(request))
    cols = ["name", "email", "role", "interviewer", "status", "pre_match_percent", "match_percent",
            "overall_score", "ai_recommendation", "confidence", "decision", "overrides_ai", "created_at", "decided_at"]
    buf = io.StringIO()
    buf.write("﻿")  # BOM so Excel opens UTF-8 correctly
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow(["" if r.get(c) is None else r.get(c) for c in cols])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=l1-candidates.csv"})


@router.post("/candidates")
async def create_candidate(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    jd_id: str = Form(...),
    phone: str | None = Form(None),
    interviewer_id: str | None = Form(None),
    cv: UploadFile = File(...),
    user=Depends(require_super),
    conn=Depends(get_conn),
):
    data = await cv.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "CV must be under 4 MB")
    try:
        cv_text = extract_text(cv.filename or "cv", data)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if fetch_one(conn, "SELECT 1 FROM candidates WHERE lower(email) = lower(%s)", (email.strip(),)):
        raise HTTPException(409, "Duplicate: a candidate with this email already exists")
    if not fetch_one(conn, "SELECT 1 FROM job_descriptions WHERE id = %s", (jd_id,)):
        raise HTTPException(400, "Unknown job description")

    with conn.transaction():
        cand = fetch_one(
            conn,
            "INSERT INTO candidates (name, email, phone, cv_filename, cv_text) VALUES (%s,%s,%s,%s,%s) RETURNING id",
            (name.strip(), email.strip(), phone, cv.filename, cv_text),
        )
        interview = fetch_one(
            conn,
            "INSERT INTO interviews (candidate_id, jd_id, interviewer_id) VALUES (%s,%s,%s) RETURNING id",
            (cand["id"], jd_id, interviewer_id or None),
        )
    audit(conn, user["id"], "create", "candidate", cand["id"], client_ip(request))
    return {"candidate_id": cand["id"], "interview_id": interview["id"]}


class AssignIn(BaseModel):
    interviewer_id: str | None


@router.put("/interviews/{interview_id}/assign")
def assign(interview_id: str, body: AssignIn, request: Request, user=Depends(require_super), conn=Depends(get_conn)):
    conn.execute("UPDATE interviews SET interviewer_id = %s WHERE id = %s", (body.interviewer_id, interview_id))
    audit(conn, user["id"], "assign", "interview", interview_id, client_ip(request))
    return {"ok": True}
