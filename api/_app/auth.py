import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_SECRET, JWT_TTL_HOURS
from .db import fetch_one, get_conn

_ITER = 240_000
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITER)
    return f"pbkdf2${_ITER}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt_b64, dk_b64 = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(iters))
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except ValueError:
        return False


def create_token(user: dict) -> str:
    payload = {
        "sub": str(user["id"]),
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    conn=Depends(get_conn),
) -> dict:
    if creds is None:
        raise HTTPException(401, "Not signed in")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired, please sign in again")
    user = fetch_one(conn, "SELECT id, name, email, role, active FROM users WHERE id = %s", (payload["sub"],))
    if not user or not user["active"]:
        raise HTTPException(401, "Account disabled")
    return user


def require_super(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "super_user":
        raise HTTPException(403, "Super User only")
    return user


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)


def load_interview_for(conn, interview_id: str, user: dict) -> dict:
    """Fetch an interview, enforcing 'Interviewers see only assigned interviews'."""
    row = fetch_one(conn, "SELECT * FROM interviews WHERE id = %s", (interview_id,))
    if not row:
        raise HTTPException(404, "Interview not found")
    if user["role"] != "super_user" and str(row["interviewer_id"]) != str(user["id"]):
        raise HTTPException(403, "This interview is not assigned to you")
    return row
