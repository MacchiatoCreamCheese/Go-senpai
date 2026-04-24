"""Async wrapper: load inputs from DB, run selector, return top problem."""

from __future__ import annotations

from typing import Any

from ... import db
from .selector import WEAKNESS_TO_PROBLEM_THEMES, score_candidates


async def pick_next(user_id: str) -> dict[str, Any] | None:
    weaknesses = await db.list_user_weaknesses(user_id)

    matching_themes: list[str] = []
    for w in weaknesses:
        if float(w.get("severity") or 0.0) <= 0:
            continue
        matching_themes.extend(WEAKNESS_TO_PROBLEM_THEMES.get(w["theme"], ()))
    # de-dupe while preserving order
    matching_themes = list(dict.fromkeys(matching_themes))

    candidates = await db.list_candidate_problems(matching_themes, limit=50)
    if not candidates and matching_themes:
        # Fall back to a random sample across all problems.
        candidates = await db.list_candidate_problems([], limit=50)

    if not candidates:
        return None

    recent = set(await db.recent_problem_ids(user_id, limit=5))
    scored = score_candidates(weaknesses, candidates, recent)
    return scored[0][0] if scored else None
