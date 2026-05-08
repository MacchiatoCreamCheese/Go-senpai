"""Score tsumego candidates against a user's weakness profile.

Pure function: no DB, no RNG. Given weakness rows (from db.list_user_weaknesses)
and candidate problem rows (from db.list_candidate_problems), return
(problem, score) pairs sorted descending. Ties are broken by lowest difficulty
first, then by problem id for reproducibility.
"""

from __future__ import annotations

from typing import Any


WEAKNESS_TO_PROBLEM_THEMES: dict[str, tuple[str, ...]] = {
    "blunder_opening": ("opening_shape", "joseki_punish"),
    "blunder_middlegame": ("capturing_race", "cutting", "sabaki"),
    "blunder_endgame": ("endgame_tesuji", "counting"),
    "ignored_top_move": ("tesuji", "shape"),
    "low_consistency_opening": ("opening_shape",),
    "low_consistency_endgame": ("endgame_tesuji",),
}

# Reverse: given a problem theme, which weakness themes does solving it address?
_PROBLEM_THEME_TO_WEAKNESSES: dict[str, tuple[str, ...]] = {}
for _wt, _pts in WEAKNESS_TO_PROBLEM_THEMES.items():
    for _pt in _pts:
        _PROBLEM_THEME_TO_WEAKNESSES.setdefault(_pt, ())
        _PROBLEM_THEME_TO_WEAKNESSES[_pt] = _PROBLEM_THEME_TO_WEAKNESSES[_pt] + (_wt,)


def weakness_themes_for_problem(problem_themes: list[str]) -> list[str]:
    """Return weakness theme names addressed by a problem's themes (deduped)."""
    seen: set[str] = set()
    result: list[str] = []
    for pt in problem_themes:
        for wt in _PROBLEM_THEME_TO_WEAKNESSES.get(pt, ()):
            if wt not in seen:
                seen.add(wt)
                result.append(wt)
    return result

RECENCY_PENALTY = 1.0
DIFFICULTY_PENALTY_PER_STEP = 0.25


def score_candidates(
    weaknesses: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
    recent_problem_ids: set[str],
    target_difficulty: int | None = None,
) -> list[tuple[dict[str, Any], float]]:
    theme_weight: dict[str, float] = {}
    for w in weaknesses:
        severity = float(w.get("severity") or 0.0)
        if severity <= 0:
            continue
        for t in WEAKNESS_TO_PROBLEM_THEMES.get(w["theme"], ()):
            theme_weight[t] = max(theme_weight.get(t, 0.0), severity)

    scored: list[tuple[dict[str, Any], float]] = []
    for c in candidates:
        s = 0.0
        for t in c.get("themes") or ():
            s += theme_weight.get(t, 0.0)
        if c["id"] in recent_problem_ids:
            s -= RECENCY_PENALTY
        if target_difficulty is not None:
            s -= abs(int(c.get("difficulty") or 0) - target_difficulty) * DIFFICULTY_PENALTY_PER_STEP
        scored.append((c, s))

    scored.sort(key=lambda x: (-x[1], int(x[0].get("difficulty") or 0), x[0]["id"]))
    return scored
