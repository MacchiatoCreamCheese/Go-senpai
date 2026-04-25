from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import db
from .auth import soft_user
from ..services.coach.session import get_or_create_session, run_coach_turn

log = logging.getLogger(__name__)
router = APIRouter()

VALID_MODES = {"whats_missing", "help_read_fight", "whats_my_plan", "followup"}


class CoachInvokeBody(BaseModel):
    user_id: str
    mode: str
    user_input: str | None = None
    session_id: str | None = None


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
        try:
            async for token in run_coach_turn(
                game_id=game_id,
                user_id=body.user_id,
                session_id=session_id,
                mode=body.mode,
                user_input=body.user_input,
                board_size=game["board_size"],
                komi=game["komi"],
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
