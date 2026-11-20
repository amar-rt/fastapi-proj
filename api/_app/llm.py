"""All model calls go through the OpenAI SDK pointed at an OpenAI-compatible endpoint
(Groq free tier by default), so the provider can be swapped with env vars only."""
import json
import re

from openai import OpenAI

from .config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL_FAST, LLM_MODEL_MAIN, STT_MODEL

_client: OpenAI | None = None


def client() -> OpenAI:
    global _client
    if _client is None:
        if not LLM_API_KEY:
            raise RuntimeError("LLM_API_KEY is not set")
        _client = OpenAI(base_url=LLM_BASE_URL, api_key=LLM_API_KEY, timeout=50, max_retries=1)
    return _client


def _parse_json(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)  # tolerate prose / code fences around JSON
        if not match:
            raise ValueError("Model did not return JSON")
        return json.loads(match.group(0))


def chat_json(system: str, user: str, fast: bool = False, max_tokens: int = 4000) -> dict:
    resp = client().chat.completions.create(
        model=LLM_MODEL_FAST if fast else LLM_MODEL_MAIN,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=max_tokens,
    )
    return _parse_json(resp.choices[0].message.content or "")


def transcribe(filename: str, audio: bytes, prompt: str | None = None) -> dict:
    resp = client().audio.transcriptions.create(
        model=STT_MODEL,
        file=(filename, audio),
        response_format="verbose_json",
        language="en",
        prompt=prompt or None,  # technical vocabulary hint improves accuracy
        temperature=0,
    )
    data = resp.model_dump() if hasattr(resp, "model_dump") else dict(resp)
    segments = [
        {"start": s.get("start"), "end": s.get("end"), "text": s.get("text")}
        for s in (data.get("segments") or [])
    ]
    return {"text": (data.get("text") or "").strip(), "segments": segments, "duration": data.get("duration")}
