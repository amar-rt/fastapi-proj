from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from .. import llm, prompts
from ..auth import client_ip, current_user, load_interview_for
from ..config import HOLD_BAND, INTERVIEW_WEIGHT, MAX_UPLOAD_BYTES
from ..db import Jsonb, audit, fetch_all, fetch_one, get_conn
from ..rubric import DEFAULT_WEIGHTS, SECTION_SPLIT, overall_fit, recommend, weighted_score

router = APIRouter(prefix="/api/interviews", tags=["interviews"])

SECTION_ORDER = {"intro": 0, "technical": 1, "wrapup": 2}


def _context(conn, interview: dict) -> tuple[dict, dict, dict | None]:
    cand = fetch_one(conn, "SELECT * FROM candidates WHERE id = %s", (interview["candidate_id"],))
    jd = fetch_one(conn, "SELECT * FROM job_descriptions WHERE id = %s", (interview["jd_id"],))
    analysis = fetch_one(conn, "SELECT match_percent, skill_breakdown, highlights, red_flags, summary "
                               "FROM pre_interview_analysis WHERE interview_id = %s", (interview["id"],))
    return cand, jd, analysis


def _redacted_cv(cand: dict) -> str:
    return prompts.redact(cand["cv_text"], cand["name"], cand["email"])


def _llm_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except Exception as e:  # surface provider errors (rate limits, bad key) to the UI
        raise HTTPException(502, f"AI service error: {e}")


def _require_status(interview: dict, allowed: tuple[str, ...], action: str) -> None:
    if interview["status"] not in allowed:
        raise HTTPException(409, f"Cannot {action} while interview is '{interview['status']}'")


# ---------- Read ----------

@router.get("/{interview_id}")
def get_interview(interview_id: str, user=Depends(current_user), conn=Depends(get_conn)):
    iv = load_interview_for(conn, interview_id, user)
    cand, jd, analysis = _context(conn, iv)
    interviewer = fetch_one(conn, "SELECT id, name FROM users WHERE id = %s", (iv["interviewer_id"],)) \
        if iv["interviewer_id"] else None
    questions = fetch_all(
        conn,
        "SELECT q.*, a.transcript, a.score, a.reasoning, a.evidence, a.follow_up AS ai_follow_up, a.segments "
        "FROM questions q LEFT JOIN answers a ON a.question_id = q.id WHERE q.interview_id = %s "
        "ORDER BY CASE q.section WHEN 'intro' THEN 0 WHEN 'technical' THEN 1 ELSE 2 END, q.sort_order, q.created_at",
        (interview_id,),
    )
    evaluation = fetch_one(conn, "SELECT * FROM evaluations WHERE interview_id = %s", (interview_id,))
    decisions = fetch_all(
        conn,
        "SELECT d.*, u.name AS decided_by_name FROM decisions d JOIN users u ON u.id = d.decided_by "
        "WHERE d.interview_id = %s ORDER BY d.decided_at DESC",
        (interview_id,),
    )
    audit(conn, user["id"], "view", "interview", interview_id)
    return {
        "interview": iv,
        "candidate": {k: cand[k] for k in ("id", "name", "email", "phone", "cv_filename", "cv_text")},
        "jd": jd | {"embedding": None},
        "interviewer": interviewer,
        "analysis": analysis,
        "questions": questions,
        "evaluation": evaluation,
        "decisions": decisions,
        "section_split": SECTION_SPLIT,
        "scoring": {"interview_weight": INTERVIEW_WEIGHT, "hold_band": HOLD_BAND},
    }


# ---------- 1. Pre-interview ----------

@router.post("/{interview_id}/analyze")
def analyze(interview_id: str, request: Request, user=Depends(current_user), conn=Depends(get_conn)):
    iv = load_interview_for(conn, interview_id, user)
    cand, jd, _ = _context(conn, iv)
    out = _llm_call(llm.chat_json, prompts.ANALYSIS_SYSTEM, prompts.analysis_user(jd, _redacted_cv(cand)))
    match = max(0, min(100, int(out.get("match_percent") or 0)))
    conn.execute(
        """INSERT INTO pre_interview_analysis (interview_id, match_percent, skill_breakdown, highlights, red_flags, summary)
           VALUES (%s,%s,%s,%s,%s,%s)
           ON CONFLICT (interview_id) DO UPDATE SET match_percent=EXCLUDED.match_percent,
             skill_breakdown=EXCLUDED.skill_breakdown, highlights=EXCLUDED.highlights,
             red_flags=EXCLUDED.red_flags, summary=EXCLUDED.summary, created_at=now()""",
        (interview_id, match, Jsonb(out.get("skill_breakdown") or []), Jsonb(out.get("highlights") or []),
         Jsonb(out.get("red_flags") or []), out.get("summary")),
    )
    audit(conn, user["id"], "analyze", "interview", interview_id, client_ip(request))
    return {"ok": True}


class GenerateIn(BaseModel):
    duration_min: int = Field(default=45)


@router.post("/{interview_id}/questions/generate")
def generate_questions(interview_id: str, body: GenerateIn, request: Request,
                       user=Depends(current_user), conn=Depends(get_conn)):
    if body.duration_min not in (30, 45, 60):
        raise HTTPException(400, "Duration must be 30, 45 or 60")
    iv = load_interview_for(conn, interview_id, user)
    _require_status(iv, ("new", "prepared"), "regenerate questions")
    cand, jd, analysis = _context(conn, iv)
    out = _llm_call(llm.chat_json, prompts.QUESTIONS_SYSTEM,
                    prompts.questions_user(jd, _redacted_cv(cand), analysis, body.duration_min), max_tokens=6000)
    items = [q for q in (out.get("questions") or []) if q.get("text") and q.get("section") in SECTION_ORDER]
    if not items:
        raise HTTPException(502, "AI returned no questions, please retry")
    with conn.transaction():
        conn.execute("DELETE FROM questions WHERE interview_id = %s AND source = 'ai'", (interview_id,))
        counters = {s: 0 for s in SECTION_ORDER}
        for q in items:
            counters[q["section"]] += 1
            diff = q.get("difficulty") if q.get("difficulty") in ("easy", "medium", "hard") else None
            conn.execute(
                "INSERT INTO questions (interview_id, section, text, skill, difficulty, expected_answer, follow_ups, "
                "sort_order, source) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'ai')",
                (interview_id, q["section"], q["text"], q.get("skill"), diff, q.get("expected_answer"),
                 Jsonb([f for f in (q.get("follow_ups") or []) if isinstance(f, str)]), counters[q["section"]] * 10),
            )
        conn.execute("UPDATE interviews SET duration_min = %s, status = 'prepared' WHERE id = %s",
                     (body.duration_min, interview_id))
    audit(conn, user["id"], "generate_questions", "interview", interview_id, client_ip(request))
    return {"count": len(items)}


class QuestionIn(BaseModel):
    section: str = Field(pattern="^(intro|technical|wrapup)$")
    text: str = Field(min_length=3)
    skill: str | None = None
    difficulty: str | None = Field(default=None, pattern="^(easy|medium|hard)$")
    expected_answer: str | None = None
    follow_ups: list[str] = []
    sort_order: int | None = None


def _question_and_interview(conn, question_id: str, user: dict) -> tuple[dict, dict]:
    q = fetch_one(conn, "SELECT * FROM questions WHERE id = %s", (question_id,))
    if not q:
        raise HTTPException(404, "Question not found")
    return q, load_interview_for(conn, q["interview_id"], user)


@router.post("/{interview_id}/questions")
def add_question(interview_id: str, body: QuestionIn, user=Depends(current_user), conn=Depends(get_conn)):
    load_interview_for(conn, interview_id, user)
    order = body.sort_order
    if order is None:
        order = fetch_one(conn, "SELECT COALESCE(max(sort_order), 0) + 10 AS n FROM questions "
                                "WHERE interview_id = %s AND section = %s", (interview_id, body.section))["n"]
    return fetch_one(
        conn,
        "INSERT INTO questions (interview_id, section, text, skill, difficulty, expected_answer, follow_ups, "
        "sort_order, source) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'manual') RETURNING id",
        (interview_id, body.section, body.text, body.skill, body.difficulty, body.expected_answer,
         Jsonb(body.follow_ups), order),
    )


@router.put("/questions/{question_id}")
def edit_question(question_id: str, body: QuestionIn, user=Depends(current_user), conn=Depends(get_conn)):
    q, _ = _question_and_interview(conn, question_id, user)
    conn.execute(
        "UPDATE questions SET section=%s, text=%s, skill=%s, difficulty=%s, expected_answer=%s, follow_ups=%s, "
        "sort_order=%s, source = CASE WHEN source = 'ai' THEN 'manual' ELSE source END WHERE id=%s",
        (body.section, body.text, body.skill, body.difficulty, body.expected_answer, Jsonb(body.follow_ups),
         body.sort_order if body.sort_order is not None else q["sort_order"], question_id),
    )
    return {"ok": True}


@router.delete("/questions/{question_id}")
def delete_question(question_id: str, user=Depends(current_user), conn=Depends(get_conn)):
    _question_and_interview(conn, question_id, user)
    conn.execute("DELETE FROM questions WHERE id = %s", (question_id,))
    return {"ok": True}


class ReorderIn(BaseModel):
    ids: list[str]


@router.post("/{interview_id}/questions/reorder")
def reorder(interview_id: str, body: ReorderIn, user=Depends(current_user), conn=Depends(get_conn)):
    load_interview_for(conn, interview_id, user)
    for i, qid in enumerate(body.ids):
        conn.execute("UPDATE questions SET sort_order = %s WHERE id = %s AND interview_id = %s",
                     ((i + 1) * 10, qid, interview_id))
    return {"ok": True}


# ---------- 2. Interview ----------

class StartIn(BaseModel):
    duration_min: int
    mode: str = Field(default="assisted", pattern="^(assisted|ai_led)$")
    consent: bool


@router.post("/{interview_id}/start")
def start(interview_id: str, body: StartIn, request: Request, user=Depends(current_user), conn=Depends(get_conn)):
    iv = load_interview_for(conn, interview_id, user)
    _require_status(iv, ("prepared", "in_progress"), "start")
    if not body.consent:
        raise HTTPException(400, "Candidate consent to recording, transcription and AI evaluation is required")
    if body.duration_min not in (30, 45, 60):
        raise HTTPException(400, "Duration must be 30, 45 or 60")
    conn.execute(
        "UPDATE interviews SET status='in_progress', duration_min=%s, mode=%s, "
        "consent_at = COALESCE(consent_at, now()), started_at = COALESCE(started_at, now()) WHERE id=%s",
        (body.duration_min, body.mode, interview_id),
    )
    audit(conn, user["id"], "start", "interview", interview_id, client_ip(request))
    return fetch_one(conn, "SELECT started_at, duration_min FROM interviews WHERE id = %s", (interview_id,))


@router.post("/questions/{question_id}/answer")
async def submit_answer(
    question_id: str,
    audio: UploadFile | None = File(None),
    transcript: str | None = Form(None),
    append: bool = Form(False),
    user=Depends(current_user),
    conn=Depends(get_conn),
):
    """Accepts recorded audio (transcribed with Whisper) or typed notes as a fallback,
    then scores the answer with the fast model. Re-submitting replaces the previous answer,
    unless append=true (a follow-up), which adds to it and re-scores the whole answer."""
    q, iv = _question_and_interview(conn, question_id, user)
    _require_status(iv, ("in_progress",), "record answers")

    segments, duration = None, None
    if audio is not None:
        data = await audio.read()
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Recording too long; keep each answer under ~4 minutes")
        if len(data) < 1000:
            raise HTTPException(400, "Recording is empty; check the microphone")
        hint = f"Technical interview about {q.get('skill') or 'software'}. Question: {q['text'][:200]}"
        stt = _llm_call(llm.transcribe, audio.filename or "answer.webm", data, hint)
        text, segments, duration = stt["text"], stt["segments"], stt["duration"]
        if transcript:  # interviewer notes typed alongside the recording
            text = f"{text}\n[Interviewer notes] {transcript}"
    elif transcript and transcript.strip():
        text = transcript.strip()
    else:
        raise HTTPException(400, "Send an audio recording or a typed answer")

    if append:
        prev = fetch_one(conn, "SELECT transcript, segments FROM answers WHERE question_id = %s", (question_id,))
        if prev:
            text = f"{prev['transcript']}\n[Follow-up] {text}"
            segments = (prev["segments"] or []) + (segments or []) or None

    scored = _llm_call(llm.chat_json, prompts.ANSWER_SYSTEM, prompts.answer_user(q, text), fast=True, max_tokens=800)
    score = scored.get("score")
    score = int(score) if isinstance(score, (int, float)) and 1 <= score <= 5 else None

    row = fetch_one(
        conn,
        """INSERT INTO answers (question_id, interview_id, transcript, segments, duration_sec, score, reasoning, evidence, follow_up)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (question_id) DO UPDATE SET transcript=EXCLUDED.transcript, segments=EXCLUDED.segments,
             duration_sec=EXCLUDED.duration_sec, score=EXCLUDED.score, reasoning=EXCLUDED.reasoning,
             evidence=EXCLUDED.evidence, follow_up=EXCLUDED.follow_up, created_at=now()
           RETURNING transcript, score, reasoning, evidence, follow_up""",
        (question_id, iv["id"], text, Jsonb(segments) if segments else None, duration, score,
         scored.get("reasoning"), scored.get("evidence"), scored.get("follow_up") or None),
    )
    return row


# ---------- 3. Post-interview ----------

def _evaluate(conn, iv: dict) -> dict:
    _, jd, analysis = _context(conn, iv)
    weights = jd["skill_weights"] or DEFAULT_WEIGHTS
    qa = fetch_all(
        conn,
        "SELECT q.section, q.text, q.skill, q.difficulty, q.expected_answer, a.transcript, a.score "
        "FROM questions q LEFT JOIN answers a ON a.question_id = q.id WHERE q.interview_id = %s "
        "ORDER BY CASE q.section WHEN 'intro' THEN 0 WHEN 'technical' THEN 1 ELSE 2 END, q.sort_order",
        (iv["id"],),
    )
    if not any(r["transcript"] for r in qa):
        raise HTTPException(400, "No answers recorded; nothing to evaluate")
    out = _llm_call(llm.chat_json, prompts.EVAL_SYSTEM, prompts.eval_user(jd, weights, qa), max_tokens=6000)

    skill_scores = []
    for s in out.get("skill_scores") or []:
        sc = s.get("score")
        skill_scores.append({
            "skill": s.get("skill"),
            "score": int(sc) if isinstance(sc, (int, float)) and 1 <= sc <= 5 else None,
            "comment": s.get("comment"),
            "evidence": s.get("evidence"),
        })
    # Selection is driven by the interview alone: weighted skill score vs the JD pass threshold.
    overall = weighted_score(skill_scores, weights)
    coverage = sum(1 for r in qa if r["transcript"]) / len(qa)
    rec, confidence, verdict = recommend(overall, float(jd["pass_threshold"]), coverage, HOLD_BAND)
    reason = f"{verdict} {out.get('summary') or ''}".strip()
    # Displayed fit only (mostly interview, a little CV); it does not affect the recommendation.
    fit = overall_fit(overall, analysis["match_percent"] if analysis else None, INTERVIEW_WEIGHT)
    conn.execute(
        """INSERT INTO evaluations (interview_id, skill_scores, overall_score, match_percent, ai_recommendation,
             confidence, reason, strengths, gaps, l2_focus)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (interview_id) DO UPDATE SET skill_scores=EXCLUDED.skill_scores,
             overall_score=EXCLUDED.overall_score, match_percent=EXCLUDED.match_percent,
             ai_recommendation=EXCLUDED.ai_recommendation, confidence=EXCLUDED.confidence, reason=EXCLUDED.reason,
             strengths=EXCLUDED.strengths, gaps=EXCLUDED.gaps, l2_focus=EXCLUDED.l2_focus, created_at=now()""",
        (iv["id"], Jsonb(skill_scores), overall, fit, rec, confidence,
         reason, Jsonb(out.get("strengths") or []), Jsonb(out.get("gaps") or []),
         Jsonb(out.get("l2_focus") or [])),
    )
    return {"overall_score": overall, "ai_recommendation": rec}


@router.post("/{interview_id}/end")
def end(interview_id: str, request: Request, user=Depends(current_user), conn=Depends(get_conn)):
    iv = load_interview_for(conn, interview_id, user)
    _require_status(iv, ("in_progress",), "end")
    conn.execute("UPDATE interviews SET status='completed', ended_at=%s WHERE id=%s",
                 (datetime.now(timezone.utc), interview_id))
    audit(conn, user["id"], "end", "interview", interview_id, client_ip(request))
    # Autocommit: 'completed' is already saved even if the evaluation call below fails.
    return _evaluate(conn, iv)


@router.post("/{interview_id}/evaluate")
def re_evaluate(interview_id: str, user=Depends(current_user), conn=Depends(get_conn)):
    iv = load_interview_for(conn, interview_id, user)
    _require_status(iv, ("completed", "decided"), "evaluate")
    return _evaluate(conn, iv)


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(selected|rejected)$")
    reason: str | None = None


@router.post("/{interview_id}/decision")
def decide(interview_id: str, body: DecisionIn, request: Request, user=Depends(current_user), conn=Depends(get_conn)):
    iv = load_interview_for(conn, interview_id, user)
    _require_status(iv, ("completed", "decided"), "decide")
    ev = fetch_one(conn, "SELECT ai_recommendation FROM evaluations WHERE interview_id = %s", (interview_id,))
    implied = {"next_round": "selected", "reject": "rejected"}.get(ev["ai_recommendation"]) if ev else None
    overrides = implied is None or implied != body.decision
    if overrides and not (body.reason and body.reason.strip()):
        raise HTTPException(400, "A reason is required when the decision differs from the AI recommendation")
    conn.execute(
        "INSERT INTO decisions (interview_id, decided_by, decision, overrides_ai, reason) VALUES (%s,%s,%s,%s,%s)",
        (interview_id, user["id"], body.decision, overrides, (body.reason or "").strip() or None),
    )
    conn.execute("UPDATE interviews SET status='decided' WHERE id=%s", (interview_id,))
    audit(conn, user["id"], "decide", "interview", interview_id, client_ip(request))
    return {"ok": True, "overrides_ai": overrides}
