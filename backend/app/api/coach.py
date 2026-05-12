from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import db
from .auth import soft_user
from ..services.coach.session import (
    fetch_coach_position,
    get_or_create_session,
    run_coach_turn,
)
from ..services.review.coach_prompts import build_general_chat_prompt
from ..services.review.llm import build_default_client

log = logging.getLogger(__name__)
router = APIRouter()

VALID_MODES = {"whats_missing", "help_read_fight", "whats_my_plan", "followup"}


class CoachInvokeBody(BaseModel):
    user_id: str
    mode: str
    user_input: str | None = None
    session_id: str | None = None


class SessionCreateBody(BaseModel):
    game_id: str
    user_id: str | None = None


class TurnAppendBody(BaseModel):
    role: str
    mode: str
    user_input: str | None = None
    assistant_output_md: str | None = None


class ChatBody(BaseModel):
    user_id: str
    message: str


@router.post("/api/games/{game_id}/coach/invoke")
async def invoke_coach(
    game_id: str,
    body: CoachInvokeBody,
    _user=Depends(soft_user),
) -> StreamingResponse:
    if body.mode not in VALID_MODES:
        raise HTTPException(400, f"mode must be one of {sorted(VALID_MODES)}")
    if body.mode == "followup" and not body.user_input:
        raise HTTPException(400, "followup requires user_input")

    game = await db.get_game_row(game_id)
    if not game:
        raise HTTPException(404, "Game not found")

    session_id = await get_or_create_session(game_id, body.user_id, body.session_id)

    async def event_stream():
        yield f"data: {json.dumps({'type': 'session', 'session_id': session_id})}\n\n"

        # For "whats_my_plan": fetch position with ownership once, emit the
        # ownership map to the frontend, then reuse the result in run_coach_turn.
        pre_position = None
        if body.mode == "whats_my_plan":
            try:
                db_moves, katago_resp = await fetch_coach_position(
                    game_id,
                    body.user_id,
                    game["board_size"],
                    game["komi"],
                    include_ownership=True,
                )
                pre_position = (db_moves, katago_resp)
                ownership = katago_resp.get("ownership") if katago_resp else None
                if ownership:
                    yield (
                        f"data: {json.dumps({'type': 'ownership', 'data': ownership, 'board_size': game['board_size']})}\n\n"
                    )
            except Exception as exc:
                log.warning("ownership pre-fetch failed: %s", exc)

        try:
            async for token in run_coach_turn(
                game_id=game_id,
                user_id=body.user_id,
                session_id=session_id,
                mode=body.mode,
                user_input=body.user_input,
                board_size=game["board_size"],
                komi=game["komi"],
                pre_position=pre_position,
            ):
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
        except Exception as exc:
            log.exception("coach turn failed for game %s", game_id)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/api/coaches/sessions")
async def create_session(body: SessionCreateBody, _user=Depends(soft_user)):
    user_id = body.user_id
    if _user is not None:
        user_id = str(_user["id"])
    if not user_id:
        raise HTTPException(400, "user_id required")
    session_id = await db.create_coach_session(body.game_id, user_id)
    return {"session_id": session_id}


@router.get("/api/coaches/sessions/{session_id}/turns")
async def get_session_turns(
    session_id: str,
    limit: int = 100,
    _user=Depends(soft_user),
):
    if _user is not None:
        session = await db.get_coach_session(session_id)
        if not session:
            raise HTTPException(404, "session not found")
        if str(session.get("user_id")) != str(_user["id"]):
            raise HTTPException(403, "forbidden")
    turns = await db.get_coach_turns(session_id, limit=limit)
    return {"turns": turns}


@router.post("/api/coaches/sessions/{session_id}/turns")
async def append_session_turn(
    session_id: str,
    body: TurnAppendBody,
    _user=Depends(soft_user),
):
    if _user is not None:
        session = await db.get_coach_session(session_id)
        if not session:
            raise HTTPException(404, "session not found")
        if str(session.get("user_id")) != str(_user["id"]):
            raise HTTPException(403, "forbidden")

    prior_turns = await db.get_coach_turns(session_id, limit=1000)
    turn_number = len(prior_turns) + 1
    await db.insert_coach_turn(
        session_id,
        turn_number,
        body.role,
        body.mode,
        body.user_input,
        body.assistant_output_md,
    )
    return {"ok": True}


@router.post("/api/coaches/sessions/{session_id}/chat")
async def chat_with_sensei(
    session_id: str,
    body: ChatBody,
    _user=Depends(soft_user),
):
    weaknesses, concepts_seen, prior_turns = await asyncio.gather(
        db.list_user_weaknesses(body.user_id),
        db.list_concepts_seen(body.user_id),
        db.get_coach_turns(session_id, limit=10),
    )

    system, user_prompt = build_general_chat_prompt(
        message=body.message,
        weaknesses=weaknesses,
        concepts_seen=concepts_seen,
        prior_turns=prior_turns,
    )

    turn_number = len(prior_turns) + 1
    await db.insert_coach_turn(session_id, turn_number, "user", "chat", body.message, None)

    llm = build_default_client()
    reply_tokens: list[str] = []
    async for token in llm.stream_generate(system, user_prompt):
        reply_tokens.append(token)
    reply = "".join(reply_tokens)

    await db.insert_coach_turn(session_id, turn_number + 1, "assistant", "chat", None, reply)
    return {"reply": reply}
