"""
Georgian Verbs – cloud sync backend
Deploy to Railway: connect a Postgres database, set JWT_SECRET env var.
"""
import os, json
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import psycopg2
import psycopg2.extras
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta

# ── CONFIG ─────────────────────────────────────────────────────────────────────
_db_url = os.environ.get("DATABASE_URL", "")
# Railway gives postgres://, psycopg2 needs postgresql://
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)
DATABASE_URL = _db_url

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-railway-env-vars")
JWT_ALGO   = "HS256"

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer  = HTTPBearer()

app = FastAPI(title="Georgian Verbs Sync")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── DB HELPERS ─────────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(DATABASE_URL)

def init_db():
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            email         TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cards (
            card_id    TEXT    NOT NULL,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            data       JSONB   NOT NULL,
            updated_at BIGINT  NOT NULL DEFAULT 0,
            PRIMARY KEY (card_id, user_id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS meta_kv (
            key        TEXT    NOT NULL,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            value      TEXT    NOT NULL,
            updated_at BIGINT  NOT NULL DEFAULT 0,
            PRIMARY KEY (key, user_id)
        )
    """)
    conn.commit()
    cur.close()
    conn.close()

@app.on_event("startup")
def startup():
    if DATABASE_URL:
        init_db()


# ── AUTH HELPERS ───────────────────────────────────────────────────────────────
def make_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(days=365)
    return jwt.encode({"sub": str(user_id), "exp": exp}, JWT_SECRET, algorithm=JWT_ALGO)

def get_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> int:
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        return int(payload["sub"])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token – please log in again")


# ── ENDPOINTS ──────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"ok": True}


@app.post("/register")
def register(body: dict):
    email    = body.get("email", "").lower().strip()
    password = body.get("password", "")
    if not email or not password or len(password) < 6:
        raise HTTPException(400, "Email required and password must be ≥ 6 characters")
    h = pwd_ctx.hash(password)
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id",
            (email, h)
        )
        user_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(400, "That email is already registered – try logging in")
    except Exception as e:
        raise HTTPException(500, f"Database error: {e}")
    return {"token": make_token(user_id), "email": email}


@app.post("/login")
def login(body: dict):
    email    = body.get("email", "").lower().strip()
    password = body.get("password", "")
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT id, password_hash FROM users WHERE email = %s", (email,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row or not pwd_ctx.verify(password, row[1]):
        raise HTTPException(401, "Invalid email or password")
    return {"token": make_token(row[0]), "email": email}


@app.get("/sync")
def pull(user_id: int = Depends(get_user_id)):
    conn = get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT data, updated_at FROM cards WHERE user_id = %s", (user_id,))
    cards = [{"data": row[0], "updatedAt": row[1]} for row in cur.fetchall()]
    cur.execute("SELECT key, value, updated_at FROM meta_kv WHERE user_id = %s", (user_id,))
    meta  = [{"key": row[0], "value": row[1], "updatedAt": row[2]} for row in cur.fetchall()]
    cur.close()
    conn.close()
    return {"cards": cards, "meta": meta}


@app.post("/sync")
def push(body: dict, user_id: int = Depends(get_user_id)):
    conn = get_conn()
    cur  = conn.cursor()

    for item in body.get("cards", []):
        card = item.get("data", {})
        ua   = item.get("updatedAt", 0)
        if not card.get("id"):
            continue
        cur.execute("""
            INSERT INTO cards (card_id, user_id, data, updated_at)
            VALUES (%s, %s, %s::jsonb, %s)
            ON CONFLICT (card_id, user_id) DO UPDATE
              SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
              WHERE cards.updated_at < EXCLUDED.updated_at
        """, (card["id"], user_id, json.dumps(card), ua))

    for item in body.get("meta", []):
        key = item.get("key")
        ua  = item.get("updatedAt", 0)
        if not key:
            continue
        cur.execute("""
            INSERT INTO meta_kv (key, user_id, value, updated_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (key, user_id) DO UPDATE
              SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
              WHERE meta_kv.updated_at < EXCLUDED.updated_at
        """, (key, user_id, str(item.get("value", "")), ua))

    conn.commit()
    cur.close()
    conn.close()
    return {"ok": True}
