import os

try:  # local dev only; on Vercel env vars come from the project settings
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

DATABASE_URL = os.environ.get("DATABASE_URL", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_TTL_HOURS = int(os.environ.get("JWT_TTL_HOURS", "12"))

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.groq.com/openai/v1")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_MODEL_MAIN = os.environ.get("LLM_MODEL_MAIN", "openai/gpt-oss-120b")
LLM_MODEL_FAST = os.environ.get("LLM_MODEL_FAST", "openai/gpt-oss-20b")
STT_MODEL = os.environ.get("STT_MODEL", "whisper-large-v3-turbo")

# Vercel rejects request bodies over 4.5 MB.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
