"""Async wrapper: load inputs from DB, run selector, return top problem."""

from __future__ import annotations

from typing import Any

from ... import db
from .selector import WEAKNESS_TO_PROBLEM_THEMES, score_candidates


# Map coarse rank_estimate strings (e.g. "20k", "5d") to a target difficulty
# in the 1..10 range used by `problems.difficulty`. Kept deliberately small:
# the class project has no rank calibration data, so this is a plausible
# default, not a learned curve.
_RANK_TO_DIFFICULTY: dict[str, int] = {
    "30k": 1, "25k": 1, "20k": 3, "15k": 5, "10k": 7, "5k": 9,
    "1k": 10, "1d": 10, "2d": 10, "3d": 10, "4d": 10, "5d": 10,
}


def _target_difficulty_for_rank(rank: str | None) -> int:
    if not rank:
        return 3
    return _RANK_TO_DIFFICULTY.get(rank.lower().strip(), 3)


async def pick_next(user_id: str) -> dict[str, Any] | None:
    weaknesses = await db.list_user_weaknesses(user_id)
    user_row = await db.get_user(user_id)
    target_difficulty = _target_difficulty_for_rank(
        user_row.get("rank_estimate") if user_row else None
    )

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
    scored = score_candidates(weaknesses, candidates, recent, target_difficulty=target_difficulty)
    return scored[0][0] if scored else None
