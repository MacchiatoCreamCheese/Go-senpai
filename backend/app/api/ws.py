from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..schemas import StateSchema
from ..sessions import GameRecord, store

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/games/{game_id}")
async def game_socket(ws: WebSocket, game_id: str) -> None:
    record = store.get(game_id)
    if not record:
        await ws.close(code=4404)
        return

    await ws.accept()
    record.subscribers.add(ws)
    try:
        # Send initial state on connect so the client can render without a separate GET.
        await ws.send_json({"event": "state", "state": StateSchema.from_game(record.game).model_dump()})
        while True:
            # We don't expect client messages for this slice; keep the socket open.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        record.subscribers.discard(ws)


async def broadcast_state(record: GameRecord, state: StateSchema) -> None:
    await _broadcast(record, {"event": "move", "state": state.model_dump()})


async def broadcast_players(
    record: GameRecord,
    black_user_id: str | None,
    white_user_id: str | None,
) -> None:
    await _broadcast(
        record,
        {
            "event": "players",
            "black_user_id": black_user_id,
            "white_user_id": white_user_id,
        },
    )


async def _broadcast(record: GameRecord, payload: dict) -> None:
    dead: list[WebSocket] = []
    for ws in record.subscribers:
        try:
            await ws.send_json(payload)
        except Exception as exc:  # connection already broken
            log.debug("dropping ws subscriber: %s", exc)
            dead.append(ws)
    for ws in dead:
        record.subscribers.discard(ws)
