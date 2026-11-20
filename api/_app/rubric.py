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
