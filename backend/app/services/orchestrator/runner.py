"""Async wrapper around the planner: load inputs, dispatch, execute tail."""

from __future__ import annotations

import asyncio
from typing import Any

from ... import db
from ..drills import pick_next
from .planner import Action, choose_next_action


async def run_session_step(user_id: str) -> dict[str, Any]:
    weaknesses, unreviewed, concepts_seen, recent_history = await asyncio.gather(
        db.list_user_weaknesses(user_id),
        db.list_unreviewed_games_for_user(user_id, limit=1),
        db.list_concepts_seen(user_id),
        db.list_action_history(user_id, limit=5),
    )

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
        recent_history=recent_history,
    )

    kind = action["kind"]
    result: dict[str, Any]

    if kind == "review_game":
        result = {"kind": "review_game", "game_id": action["game_id"], "reason": "You have an unreviewed game — reviewing it updates your weakness model."}

    elif kind == "serve_drill":
        top = weaknesses[0]["theme"].replace("_", " ") if weaknesses else None
        reason = f"Drilling to reinforce your work on {top}." if top else "Practising with a tsumego problem."
        result = {"kind": "serve_drill", "problem": drill_problem, "reason": reason}

    elif kind == "idle":
        result = {"kind": "idle", "reason": action.get("reason", "")}

    else:
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
                result = {"kind": "idle", "reason": f"concept {concept_id!r} missing and no drills available"}
            else:
                result = {"kind": "serve_drill", "problem": drill_problem}
        else:
            await db.record_concept_taught(user_id, concept_id)
            verb = "Revisiting" if kind == "revisit_concept" else "Teaching"
            reason = f"{verb} '{concept['title']}' to address your weakness patterns."
            result = {"kind": kind, "concept": concept, "reason": reason}

    # Fire-and-forget history write — never let audit failures surface to user.
    try:
        await db.insert_action_history(
            user_id=user_id,
            kind=result["kind"],
            game_id=result.get("game_id"),
            problem_id=result.get("problem", {}).get("id") if result.get("problem") else None,
            concept_id=result.get("concept", {}).get("id") if result.get("concept") else None,
            reason=result.get("reason"),
        )
    except Exception:
        pass

    return result
