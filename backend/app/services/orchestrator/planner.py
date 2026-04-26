"""Deterministic dispatch: pick the next coaching action for a user.

Pure function — no DB, no RNG, no LLM. Callers load the inputs and execute
whatever tail-action is returned (fetch the concept body, call the drill
picker, etc.). This keeps the agentic logic legible and testable.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal, TypedDict


# Weakness theme → concept id to teach when that weakness is active.
# The concept_id must match a row in `go_concepts.id`. Keeping this in code
# (not a DB table) so it's easy to edit and version-control.
WEAKNESS_TO_CONCEPT_ID: dict[str, str] = {
    "blunder_opening": "opening_principles",
    "blunder_middlegame": "capturing_races",
    "blunder_endgame": "endgame_tesuji",
    "ignored_top_move": "shape_fundamentals",
    "low_consistency_opening": "opening_principles",
    "low_consistency_endgame": "endgame_tesuji",
}

SEVERITY_THRESHOLD = 0.2
REVISIT_AFTER = timedelta(hours=24)
RETEACH_AFTER = timedelta(days=7)


ActionKind = Literal["review_game", "revisit_concept", "teach_concept", "serve_drill", "idle"]


class Action(TypedDict, total=False):
    kind: ActionKind
    game_id: str
    concept_id: str
    reason: str


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _seen_map(concepts_seen: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {row["concept_id"]: row for row in concepts_seen}


def _recently_picked(history: list[dict[str, Any]], kind: str, minutes: int, now: datetime) -> bool:
    cutoff = now - timedelta(minutes=minutes)
    for entry in history:
        if entry.get("kind") != kind:
            continue
        picked = entry.get("picked_at")
        if picked is None:
            continue
        if isinstance(picked, str):
            try:
                picked = datetime.fromisoformat(picked)
            except ValueError:
                continue
        if picked.tzinfo is None:
            picked = picked.replace(tzinfo=timezone.utc)
        if picked >= cutoff:
            return True
    return False


def _last_n_kinds(history: list[dict[str, Any]], n: int) -> list[str]:
    return [e["kind"] for e in history[:n] if "kind" in e]


def choose_next_action(
    weaknesses: list[dict[str, Any]],
    unreviewed_games: list[dict[str, Any]],
    concepts_seen: list[dict[str, Any]],
    has_candidate_drill: bool,
    recent_history: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
) -> Action:
    current = now or _now()
    seen = _seen_map(concepts_seen)
    history = recent_history or []

    # 1. review_game: freshest evidence first.
    # Skip if the same game was already suggested within the last 15 min —
    # user is likely not going to act on it right now, try something else.
    if unreviewed_games:
        game = unreviewed_games[0]
        same_game_recent = any(
            e.get("kind") == "review_game" and str(e.get("game_id")) == str(game["id"])
            for e in history
            if _recently_picked([e], "review_game", 15, current)
        )
        if not same_game_recent:
            return {"kind": "review_game", "game_id": str(game["id"])}

    # 2. revisit_concept: taught but not yet demonstrated, and recent enough.
    for row in concepts_seen:
        if row.get("user_demonstrated"):
            continue
        if int(row.get("times_taught") or 0) < 1:
            continue
        last = row.get("last_taught_at")
        if last is None:
            continue
        if isinstance(last, str):
            try:
                last = datetime.fromisoformat(last)
            except ValueError:
                continue
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if current - last > REVISIT_AFTER:
            return {"kind": "revisit_concept", "concept_id": row["concept_id"]}

    # 3. teach_concept: highest-severity weakness whose concept is new
    # (or stale + still not demonstrated).
    ranked = sorted(
        weaknesses,
        key=lambda w: float(w.get("severity") or 0.0),
        reverse=True,
    )
    for w in ranked:
        if float(w.get("severity") or 0.0) < SEVERITY_THRESHOLD:
            break
        concept_id = WEAKNESS_TO_CONCEPT_ID.get(w["theme"])
        if concept_id is None:
            continue
        existing = seen.get(concept_id)
        if existing is None:
            return {"kind": "teach_concept", "concept_id": concept_id}
        if existing.get("user_demonstrated"):
            continue
        last = existing.get("last_taught_at")
        if isinstance(last, str):
            try:
                last = datetime.fromisoformat(last)
            except ValueError:
                last = None
        if last is None:
            return {"kind": "teach_concept", "concept_id": concept_id}
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if current - last > RETEACH_AFTER:
            return {"kind": "teach_concept", "concept_id": concept_id}

    # 4. serve_drill (or idle if nothing available).
    # Avoid hammering drills: if the last 2 picks were both serve_drill, skip
    # this round so the session stays varied.
    last_two = _last_n_kinds(history, 2)
    drill_streak = len(last_two) == 2 and all(k == "serve_drill" for k in last_two)
    if has_candidate_drill and not drill_streak:
        return {"kind": "serve_drill"}
    return {"kind": "idle", "reason": "no content available"}
