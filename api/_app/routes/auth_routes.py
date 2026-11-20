from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from ..auth import client_ip, create_token, current_user, hash_password, verify_password
from ..db import audit, fetch_one, get_conn

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class BootstrapIn(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)


@router.get("/status")
def status(conn=Depends(get_conn)):
    """Tells the UI whether first-run setup is still needed."""
    row = fetch_one(conn, "SELECT count(*) AS n FROM users")
    return {"needs_setup": row["n"] == 0}


@router.post("/bootstrap")
def bootstrap(body: BootstrapIn, request: Request, conn=Depends(get_conn)):
    """Create the first Super User. Only works while the users table is empty."""
    with conn.transaction():
        conn.execute("LOCK TABLE users IN EXCLUSIVE MODE")
        if fetch_one(conn, "SELECT count(*) AS n FROM users")["n"] > 0:
            raise HTTPException(409, "Setup already done")
        user = fetch_one(
            conn,
            "INSERT INTO users (name, email, password_hash, role) VALUES (%s,%s,%s,'super_user') "
            "RETURNING id, name, email, role",
            (body.name, body.email.lower(), hash_password(body.password)),
        )
    audit(conn, user["id"], "bootstrap", "user", user["id"], client_ip(request))
    return {"token": create_token(user), "user": user}


@router.post("/login")
def login(body: LoginIn, request: Request, conn=Depends(get_conn)):
    user = fetch_one(conn, "SELECT * FROM users WHERE email = %s", (body.email.lower().strip(),))
    if not user or not user["active"] or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Wrong email or password")
    audit(conn, user["id"], "login", "user", user["id"], client_ip(request))
    public = {k: user[k] for k in ("id", "name", "email", "role")}
    return {"token": create_token(user), "user": public}


@router.get("/me")
def me(user=Depends(current_user)):
    return user
