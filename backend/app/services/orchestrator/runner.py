"""Async wrapper around the planner: load inputs, dispatch, execute tail."""

from __future__ import annotations

from typing import Any

from ... import db
from ..drills import pick_next
from .planner import Action, choose_next_action


async def run_session_step(user_id: str) -> dict[str, Any]:
    weaknesses = await db.list_user_weaknesses(user_id)
    unreviewed = await db.list_unreviewed_games_for_user(user_id, limit=1)
    concepts_seen = await db.list_concepts_seen(user_id)

    # We don't know if a drill is available without querying; the planner
    # only needs a boolean. Peek one candidate via the same path pick_next
    # would use, to keep the decision consistent.
    has_drill = False
    drill_problem: dict[str, Any] | None = None
    if not unreviewed:
        drill_problem = await pick_next(user_id)
        has_drill = drill_problem is not None

    action: Action = choose_next_action(
        weaknesses=weaknesses,
        unreviewed_games=unreviewed,
        concepts_seen=concepts_seen,
        has_candidate_drill=has_drill,
    )

    kind = action["kind"]

    if kind == "review_game":
        return {"kind": "review_game", "game_id": action["game_id"]}

    if kind == "serve_drill":
        # We already fetched the problem above to decide has_candidate_drill.
        return {"kind": "serve_drill", "problem": drill_problem}

    if kind == "idle":
        return {"kind": "idle", "reason": action.get("reason", "")}

    # teach_concept / revisit_concept: load the concept row and record the
    # teaching so the dispatch rules can react next time.
    concept_id = action["concept_id"]
    concept = await db.get_concept(concept_id)
    if concept is None:
        # The mapping pointed to a concept that isn't seeded; fall back to a
        # drill rather than 500-ing the endpoint.
        if drill_problem is None:
            drill_problem = await pick_next(user_id)
        if drill_problem is None:
            return {"kind": "idle", "reason": f"concept {concept_id!r} missing and no drills available"}
        return {"kind": "serve_drill", "problem": drill_problem}

    await db.record_concept_taught(user_id, concept_id)
    return {"kind": kind, "concept": concept}
