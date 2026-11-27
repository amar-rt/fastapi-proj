"""Skill areas from the proposal (slide 11). Weights are configurable per JD."""

SKILL_AREAS: dict[str, str] = {
    "Communication": "Clarity, structure, fluency",
    "Scripting / coding": "Language, syntax, code",
    "AI / ML knowledge": "Concepts, tools, practical use",
    "Database": "SQL, modelling, indexing, NoSQL",
    "Problem solving": "Approach, trade-offs",
    "Logical reasoning": "Structured thinking, accuracy",
    "System design": "Architecture, scale, reliability",
    "Leadership": "Mentoring, ownership, decisions",
    "Attitude and fit": "Professionalism, motivation",
    "Special skills": "Anything notable beyond the JD",
}

DEFAULT_WEIGHTS: dict[str, float] = {
    "Communication": 1,
    "Scripting / coding": 2,
    "AI / ML knowledge": 0,
    "Database": 1,
    "Problem solving": 2,
    "Logical reasoning": 1,
    "System design": 1,
    "Leadership": 0,
    "Attitude and fit": 1,
    "Special skills": 0,
}

SCALE = {1: "Poor", 2: "Basic", 3: "Good", 4: "Strong", 5: "Expert"}

# Share of interview time per section.
SECTION_SPLIT = {"intro": 0.2, "technical": 0.65, "wrapup": 0.15}


def weighted_score(skill_scores: list[dict], weights: dict[str, float]) -> float | None:
    """Deterministic weighted average over skills that were actually assessed."""
    total = wsum = 0.0
    for s in skill_scores:
        score = s.get("score")
        w = float(weights.get(s.get("skill"), 0) or 0)
        if isinstance(score, (int, float)) and w > 0:
            total += score * w
            wsum += w
    return round(total / wsum, 2) if wsum else None


def recommend(overall: float | None, threshold: float, coverage: float, hold_band: float) -> tuple[str, int, str]:
    """Recommendation from the interview score only (never the CV).

    >= threshold -> next_round; within `hold_band` below -> hold; lower -> reject.
    Confidence grows with distance from the threshold and with question coverage."""
    if overall is None or coverage < 0.4:
        return "hold", 30, "Too few questions were answered to make a reliable recommendation."
    margin = overall - threshold
    if margin >= 0:
        rec = "next_round"
    elif margin >= -hold_band:
        rec = "hold"
    else:
        rec = "reject"
    confidence = round((55 + min(abs(margin), 1.0) * 40) * (0.6 + 0.4 * coverage))
    label = {"next_round": "next round", "hold": "hold", "reject": "reject"}[rec]
    return rec, confidence, f"Interview score {overall:.2f}/5 vs pass threshold {threshold:.1f}: {label}."


def overall_fit(overall: float | None, cv_match: int | None, interview_weight: float) -> int | None:
    """Displayed JD fit: mostly interview performance, a little CV match. Not used for selection."""
    if overall is None:
        return cv_match
    interview_pct = (overall - 1) / 4 * 100
    if cv_match is None:
        return round(interview_pct)
    return round(interview_weight * interview_pct + (1 - interview_weight) * cv_match)
