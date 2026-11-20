"""Prompt builders. Every prompt asks for strict JSON and applies the bias rules from the proposal:
score job-relevant content only; never name, gender, age, accent or photo."""
import json
import re

from .rubric import SCALE, SKILL_AREAS

FAIRNESS = (
    "Fairness rules: judge only job-relevant content. Ignore and never mention name, gender, age, "
    "nationality, accent, grammar slips caused by speech-to-text, photo or any personal attribute. "
    "Transcripts come from automatic speech recognition and may contain recognition errors; "
    "interpret technical terms charitably when the intent is clear."
)


def redact(cv_text: str, name: str, email: str) -> str:
    """Remove direct identifiers before the CV goes to the model."""
    out = cv_text
    for token in filter(None, [email, *name.split()]):
        if len(token) > 1:
            out = re.sub(rf"(?<!\w){re.escape(token)}(?!\w)", "[CANDIDATE]", out, flags=re.IGNORECASE)
    out = re.sub(r"[\w.+-]+@[\w-]+\.[\w.]+", "[EMAIL]", out)
    out = re.sub(r"\+?\d[\d\s().-]{8,}\d", "[PHONE]", out)
    return out


def _jd_block(jd: dict) -> str:
    return (
        f"JOB TITLE: {jd['title']}\n"
        f"MUST-HAVE SKILLS: {', '.join(jd['must_have']) or '-'}\n"
        f"NICE-TO-HAVE SKILLS: {', '.join(jd['nice_to_have']) or '-'}\n"
        f"JOB DESCRIPTION:\n{jd['description']}"
    )


# ---------- 1. Pre-interview analysis ----------

ANALYSIS_SYSTEM = f"""You are a senior technical recruiter preparing a one-page brief for a NON-technical interviewer.
Compare the candidate CV with the job description. {FAIRNESS}
Return JSON only, exactly this shape:
{{
  "match_percent": <int 0-100, overall fit to the JD>,
  "summary": "<2-3 sentence plain-English summary of fit>",
  "skill_breakdown": [{{"skill": "<JD skill>", "status": "matched|partial|missing", "years": <number or null>, "note": "<short evidence from CV>"}}],
  "highlights": ["<standout achievement, relevant project, certification>"],
  "red_flags": ["<gap, short tenure, vague claim, skill with no supporting project — phrased as something to probe>"]
}}
Cover every must-have and nice-to-have skill in skill_breakdown. Keep each string under 200 characters."""


def analysis_user(jd: dict, cv_text: str) -> str:
    return f"{_jd_block(jd)}\n\n---\nCANDIDATE CV:\n{cv_text[:24000]}"


# ---------- 2. Question generation ----------

QUESTIONS_SYSTEM = f"""You design L1 technical interviews that a NON-technical interviewer (HR) will run.
For every question give an expected-answer outline in plain language listing the key points a good answer
contains, so the interviewer can judge it without technical knowledge. {FAIRNESS}
Return JSON only:
{{
  "questions": [
    {{"section": "intro|technical|wrapup", "text": "<question>", "skill": "<one of the skill areas>",
      "difficulty": "easy|medium|hard", "expected_answer": "<bullet-style key points, separated by '; '>",
      "follow_ups": ["<probing follow-up>", "<second follow-up>"]}}
  ]
}}
Sections:
- intro: background, current role, responsibilities, depth of knowledge in the role.
- technical: from the JD and CV, ordered easy -> hard. Probe the red flags and partial/missing must-haves.
- wrapup: motivation for switching, notice period, expectations, invite the candidate's questions.
Skill areas: {", ".join(SKILL_AREAS)}."""


def questions_user(jd: dict, cv_text: str, analysis: dict | None, duration_min: int) -> str:
    n_intro, n_tech, n_wrap = {30: (2, 6, 2), 45: (3, 8, 2), 60: (3, 11, 3)}.get(duration_min, (3, 8, 2))
    brief = json.dumps(analysis, default=str)[:6000] if analysis else "(none)"
    return (
        f"Interview length: {duration_min} minutes. Generate exactly {n_intro} intro, {n_tech} technical "
        f"and {n_wrap} wrapup questions.\n\n{_jd_block(jd)}\n\n---\nPRE-INTERVIEW BRIEF:\n{brief}"
        f"\n\n---\nCANDIDATE CV:\n{cv_text[:16000]}"
    )


# ---------- 3. Per-answer scoring (fast model) ----------

ANSWER_SYSTEM = f"""You score a single interview answer against an expected-answer outline.
Scale: {json.dumps(SCALE)}. {FAIRNESS}
If the answer is empty, off-topic or "I don't know", score 1.
Return JSON only:
{{"score": <int 1-5>, "reasoning": "<1-2 sentences>", "evidence": "<short verbatim quote from the answer>",
  "follow_up": "<one probing follow-up if the answer was thin or vague, else empty string>"}}"""


def answer_user(question: dict, transcript: str) -> str:
    return (
        f"SKILL: {question.get('skill') or '-'}\nDIFFICULTY: {question.get('difficulty') or '-'}\n"
        f"QUESTION: {question['text']}\nEXPECTED ANSWER OUTLINE: {question.get('expected_answer') or '-'}\n"
        f"---\nCANDIDATE ANSWER (transcript):\n{transcript[:8000]}"
    )


# ---------- 4. Final evaluation ----------

EVAL_SYSTEM = f"""You write the L1 interview report. Score each requested skill area 1-5 using the scale
{json.dumps(SCALE)}, with a short comment and a verbatim evidence quote from the transcript.
If a skill area was not covered in the interview, return "score": null and say "Not assessed".
{FAIRNESS}
Return JSON only:
{{
  "skill_scores": [{{"skill": "<area>", "score": <1-5 or null>, "comment": "<1-2 sentences>", "evidence": "<quote>"}}],
  "match_percent": <int 0-100, updated JD fit using CV plus interview>,
  "recommendation": "next_round|hold|reject",
  "confidence": <int 0-100>,
  "reason": "<2-3 sentence justification>",
  "strengths": ["..."], "gaps": ["..."],
  "l2_focus": ["<area the L2 interviewer should probe>"]
}}"""


def eval_user(jd: dict, weights: dict, analysis: dict | None, qa: list[dict]) -> str:
    areas = [f"- {a} (weight {w}): {SKILL_AREAS.get(a, '')}" for a, w in weights.items() if float(w or 0) > 0]
    lines = []
    for i, q in enumerate(qa, 1):
        lines.append(
            f"Q{i} [{q['section']}/{q.get('skill') or '-'}/{q.get('difficulty') or '-'}]: {q['text']}\n"
            f"Expected: {q.get('expected_answer') or '-'}\n"
            f"Answer: {q.get('transcript') or '(not answered)'}\n"
            f"Per-answer score: {q.get('score') or '-'}"
        )
    return (
        f"{_jd_block(jd)}\nPASS THRESHOLD (weighted score): {jd['pass_threshold']}\n\n"
        f"SKILL AREAS TO SCORE:\n" + "\n".join(areas) + "\n\n"
        f"PRE-INTERVIEW BRIEF:\n{json.dumps(analysis, default=str)[:4000] if analysis else '(none)'}\n\n"
        f"TRANSCRIPT BY QUESTION:\n" + "\n\n".join(lines)[:40000]
    )
