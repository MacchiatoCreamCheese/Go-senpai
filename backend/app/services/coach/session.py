from __future__ import annotations

import logging
import re
from typing import Any, AsyncGenerator

from ... import db
from ...services.katago.engine import get_engine
from ...services.review.retriever import retrieve_for_moment
from ...services.review.selector import Moment
from ...services.review.llm import build_default_client
from ...services.review.coach_prompts import build_coach_prompt
from .engine_query import query_current_position

log = logging.getLogger(__name__)

COORDINATE_RE = re.compile(r"\b[A-HJ-T]\d{1,2}\b")
_SPOILER_MODES = {"whats_missing", "whats_my_plan"}


def _rank_label(rank_estimate: int | str | None) -> str:
    try:
        r = int(rank_estimate)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return "intermediate"
    if r > 15:
        return "beginner"
    if r > 5:
        return "intermediate"
    return "expert"


def _infer_phase(move_count: int, board_size: int) -> str:
    total = board_size * board_size
    if move_count < total * 0.15:
        return "opening"
    if move_count < total * 0.55:
        return "middlegame"
    return "endgame"


def _compact_katago(resp: dict[str, Any] | None) -> dict[str, Any] | None:
    if not resp:
        return None
    root = resp.get("rootInfo", {})
    move_infos = resp.get("moveInfos", [])
    top_moves = [
        {"move": m.get("move"), "prior": round(m.get("prior", 0), 3)}
        for m in move_infos[:3]
    ]
    return {
        "winrate": round(root.get("winrate", 0.5), 3),
        "score_lead": round(root.get("scoreLead", 0), 2),
        "top_moves": top_moves,
    }


def _sparse_ownership(resp: dict[str, Any] | None) -> list[float] | None:
    if not resp:
        return None
    ownership = resp.get("ownership")
    if not ownership:
        return None
    return [round(v, 2) for v in ownership[::3]]


async def get_or_create_session(
    game_id: str, user_id: str, session_id: str | None
) -> str:
    if session_id:
        return session_id
    return await db.create_coach_session(game_id, user_id)


async def fetch_coach_position(
    game_id: str,
    user_id: str,
    board_size: int,
    komi: float,
    include_ownership: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Load moves from DB and run a KataGo query. Returns (db_moves, katago_resp)."""
    db_moves = await db.get_moves(game_id)
    engine = get_engine()
    katago_resp = None
    if engine and db_moves:
        try:
            katago_resp = await query_current_position(
                engine=engine,
                board_size=board_size,
                komi=komi,
                rules="chinese",
                db_moves=db_moves,
                include_ownership=include_ownership,
            )
        except Exception as exc:
            log.warning("coach engine query failed: %s", exc)
    return db_moves, katago_resp


async def run_coach_turn(
    *,
    game_id: str,
    user_id: str,
    session_id: str,
    mode: str,
    user_input: str | None,
    board_size: int,
    komi: float,
    pre_position: tuple[list[dict[str, Any]], dict[str, Any] | None] | None = None,
) -> AsyncGenerator[str, None]:
    """Async generator that yields LLM tokens for a single coach turn."""

    # 1. Load DB state — reuse pre-fetched position if supplied
    if pre_position is not None:
        db_moves, katago_resp = pre_position
    else:
        db_moves, katago_resp = await fetch_coach_position(
            game_id, user_id, board_size, komi,
            include_ownership=(mode == "whats_my_plan"),
        )

    prior_turns = await db.get_coach_turns(session_id, limit=6)
    player_notes = await db.get_player_move_notes(game_id, user_id)
    user_row = await db.get_user(user_id)
    rank_label = _rank_label(user_row.get("rank_estimate") if user_row else None)

    # 2. Concept retrieval (best-effort)
    concepts: list[dict] = []
    if db_moves:
        try:
            last = db_moves[-1]
            moment = Moment(
                move_number=len(db_moves),
                color=last["color"],
                coord=last["coord"],
                top_move=None,
                points_lost=0.0,
                confident_points_lost=0.0,
                winrate_before=None,
                winrate_after=None,
                score_before=None,
                score_after=None,
                phase=_infer_phase(len(db_moves), board_size),  # type: ignore[arg-type]
                is_blunder=False,
                kind="critical_decision",
                top_pv=None,
            )
            retrieved = await retrieve_for_moment(moment, limit=2)
            concepts = [{"id": c.id, "title": c.title} for c in retrieved]
        except Exception as exc:
            log.debug("coach concept retrieval failed: %s", exc)

    # 3. Build prompt
    move_count = len(db_moves)
    game_summary = {
        "board_size": board_size,
        "move_count": move_count,
        "phase": _infer_phase(move_count, board_size),
        "recent_moves": [
            {"color": m["color"], "coord": m["coord"]} for m in db_moves[-3:]
        ],
        "player_notes": [
            {"move_number": mn, "thought": body}
            for mn, body in sorted(player_notes.items())
            if mn >= move_count - 8
        ],
    }
    system, user_prompt = build_coach_prompt(
        mode=mode,
        game_summary=game_summary,
        katago_features=_compact_katago(katago_resp),
        ownership_map=_sparse_ownership(katago_resp) if mode == "whats_my_plan" else None,
        prior_turns=prior_turns,
        user_input=user_input,
        rank_label=rank_label,
        retrieved_concepts=concepts,
    )

    # 4. Persist user turn
    turn_number = len(prior_turns) + 1
    await db.insert_coach_turn(session_id, turn_number, "user", mode, user_input, None)

    # 5. Stream LLM tokens; accumulate for guardrail + persistence
    llm = build_default_client()
    accumulated: list[str] = []

    async for token in llm.stream_generate(system, user_prompt):
        accumulated.append(token)
        yield token

    full_text = "".join(accumulated)

    # 6. Coordinate guardrail for no-spoiler modes
    if mode in _SPOILER_MODES and COORDINATE_RE.search(full_text):
        suffix = "\n\n_(Coach note: specific moves omitted — try to find them yourself!)_"
        yield suffix
        full_text += suffix

    # 7. Persist assistant turn
    await db.insert_coach_turn(
        session_id, turn_number + 1, "assistant", mode, None, full_text
    )
