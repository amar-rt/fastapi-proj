from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from ..auth import client_ip, current_user, hash_password, require_super
from ..db import Jsonb, audit, fetch_all, fetch_one, get_conn
from ..rubric import DEFAULT_WEIGHTS, SKILL_AREAS

router = APIRouter(prefix="/api", tags=["admin"])


# ---------- Users ----------

class UserIn(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)
    role: str = Field(pattern="^(super_user|interviewer)$")


class UserPatch(BaseModel):
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8)


@router.get("/users")
def list_users(_=Depends(current_user), conn=Depends(get_conn)):
    # Interviewers need the list too (filters); no sensitive fields are returned.
    return fetch_all(conn, "SELECT id, name, email, role, active, created_at FROM users ORDER BY name")


@router.post("/users")
def create_user(body: UserIn, request: Request, user=Depends(require_super), conn=Depends(get_conn)):
    if fetch_one(conn, "SELECT 1 FROM users WHERE email = %s", (body.email.lower(),)):
        raise HTTPException(409, "A user with this email already exists")
    row = fetch_one(
        conn,
        "INSERT INTO users (name, email, password_hash, role) VALUES (%s,%s,%s,%s) "
        "RETURNING id, name, email, role, active",
        (body.name, body.email.lower(), hash_password(body.password), body.role),
    )
    audit(conn, user["id"], "create", "user", row["id"], client_ip(request))
    return row


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UserPatch, request: Request, user=Depends(require_super), conn=Depends(get_conn)):
    if body.active is not None:
        conn.execute("UPDATE users SET active = %s WHERE id = %s", (body.active, user_id))
    if body.password:
        conn.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(body.password), user_id))
    audit(conn, user["id"], "update", "user", user_id, client_ip(request))
    return {"ok": True}


# ---------- Job descriptions ----------

class JDIn(BaseModel):
    title: str = Field(min_length=1)
    description: str = Field(min_length=20)
    must_have: list[str] = []
    nice_to_have: list[str] = []
    skill_weights: dict[str, float] = Field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    pass_threshold: float = Field(default=3.0, ge=1, le=5)


@router.get("/rubric")
def rubric(_=Depends(current_user)):
    return {"areas": SKILL_AREAS, "default_weights": DEFAULT_WEIGHTS}


@router.get("/jds")
def list_jds(_=Depends(current_user), conn=Depends(get_conn)):
    return fetch_all(conn, "SELECT id, title, description, must_have, nice_to_have, skill_weights, "
                           "pass_threshold, created_at FROM job_descriptions ORDER BY created_at DESC")


def _clean(items: list[str]) -> list[str]:
    return [s.strip() for s in items if s.strip()]


@router.post("/jds")
def create_jd(body: JDIn, request: Request, user=Depends(require_super), conn=Depends(get_conn)):
    row = fetch_one(
        conn,
        "INSERT INTO job_descriptions (title, description, must_have, nice_to_have, skill_weights, "
        "pass_threshold, created_by) VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (body.title, body.description, _clean(body.must_have), _clean(body.nice_to_have),
         Jsonb(body.skill_weights), body.pass_threshold, user["id"]),
    )
    audit(conn, user["id"], "create", "job_description", row["id"], client_ip(request))
    return row


@router.put("/jds/{jd_id}")
def update_jd(jd_id: str, body: JDIn, request: Request, user=Depends(require_super), conn=Depends(get_conn)):
    conn.execute(
        "UPDATE job_descriptions SET title=%s, description=%s, must_have=%s, nice_to_have=%s, "
        "skill_weights=%s, pass_threshold=%s WHERE id=%s",
        (body.title, body.description, _clean(body.must_have), _clean(body.nice_to_have),
         Jsonb(body.skill_weights), body.pass_threshold, jd_id),
    )
    audit(conn, user["id"], "update", "job_description", jd_id, client_ip(request))
    return {"ok": True}


@router.get("/audit")
def audit_log(_=Depends(require_super), conn=Depends(get_conn)):
    return fetch_all(
        conn,
        "SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id "
        "ORDER BY a.created_at DESC LIMIT 500",
    )
