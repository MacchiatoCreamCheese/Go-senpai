from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import db
from ..engine.board import BLACK, WHITE
from ..engine.coords import from_coord
from ..engine.game import GameState, MoveKind
from ..schemas import StateSchema
from ..sessions import GameRecord, store

log = logging.getLogger(__name__)
router = APIRouter()


async def _load_record(game_id: str) -> GameRecord | None:
    record = store.get(game_id)
    if record:
        return record
    row = await db.get_game_row(game_id)
    if not row:
        return None
    game = GameState.new(size=row["board_size"], komi=row["komi"])
    for m in await db.get_moves(game_id):
        color = BLACK if m["color"] == "B" else WHITE
        coord: str = m["coord"]
        if coord == "pass":
            game.play(color, MoveKind.PASS)
        elif coord == "resign":
            game.play(color, MoveKind.RESIGN)
        else:
            r, c = from_coord(coord, game.size)
            game.play(color, MoveKind.PLAY, point=(r, c))
    return store.create(game_id, game)


@router.websocket("/ws/games/{game_id}")
async def game_socket(ws: WebSocket, game_id: str) -> None:
    record = await _load_record(game_id)
    if not record:
        await ws.close(code=4404)
        return

    await ws.accept()
    record.subscribers.add(ws)
    try:
        # Send initial state on connect so the client can render without a separate GET.
        await ws.send_json({"event": "state", "state": StateSchema.from_game(record.game).model_dump()})
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("event") == "chat":
                message = str(msg.get("message", "")).strip()[:500]
                user_id = str(msg.get("user_id", ""))
                if message:
                    await _broadcast(record, {
                        "event": "chat",
                        "user_id": user_id,
                        "message": message,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    })
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


async def broadcast_move_tier(record: GameRecord, move_number: int, tier: str) -> None:
    await _broadcast(record, {"event": "move_tier", "move_number": move_number, "tier": tier})


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
