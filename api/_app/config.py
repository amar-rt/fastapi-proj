import os

try:  # local dev only; on Vercel env vars come from the project settings
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

# Vercel's Neon integration sets DATABASE_URL and/or POSTGRES_URL.
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or ""
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_TTL_HOURS = int(os.environ.get("JWT_TTL_HOURS", "12"))

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1")
# strip() guards against quotes/newlines pasted into the Vercel env var UI
LLM_API_KEY = os.environ.get("LLM_API_KEY", "").strip().strip("'\"").strip()
LLM_MODEL_MAIN = os.environ.get("LLM_MODEL_MAIN", "openai/gpt-oss-120b")
LLM_MODEL_FAST = os.environ.get("LLM_MODEL_FAST", "openai/gpt-oss-20b")
STT_MODEL = os.environ.get("STT_MODEL", "whisper-large-v3-turbo")

# Selection is decided by the interview score alone. CV match only feeds the displayed
# "overall fit" figure, at this share (default 80% interview / 20% CV).
INTERVIEW_WEIGHT = float(os.environ.get("INTERVIEW_WEIGHT", "0.8"))
# Scores within this distance below the pass threshold are recommended "hold".
HOLD_BAND = float(os.environ.get("HOLD_BAND", "0.5"))

# Vercel rejects request bodies over 4.5 MB.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
