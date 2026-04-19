from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from ..engine.game import GameState, MoveKind
from ..engine.rules import IllegalMove
from ..engine.sgf import export_sgf
from ..schemas import (
    CreateGameRequest,
    GameSchema,
    MoveRequest,
    StateSchema,
    color_from_code,
)
from ..sessions import store
from .ws import broadcast_state

router = APIRouter(prefix="/api", tags=["games"])


@router.post("/games", response_model=GameSchema, status_code=201)
async def create_game(req: CreateGameRequest) -> GameSchema:
    game = GameState.new(size=req.size, komi=req.komi)
    record = store.create(game)
    return GameSchema(id=record.id, size=game.size, komi=game.komi, state=StateSchema.from_game(game))


@router.get("/games/{game_id}", response_model=GameSchema)
async def get_game(game_id: str) -> GameSchema:
    record = store.get(game_id)
    if not record:
        raise HTTPException(status_code=404, detail="game not found")
    return GameSchema(id=record.id, size=record.game.size, komi=record.game.komi, state=StateSchema.from_game(record.game))


@router.post("/games/{game_id}/moves", response_model=StateSchema)
async def play_move(game_id: str, req: MoveRequest) -> StateSchema:
    record = store.get(game_id)
    if not record:
        raise HTTPException(status_code=404, detail="game not found")

    async with record.lock:
        try:
            record.game.play(
                color=color_from_code(req.color),
                kind=MoveKind(req.kind),
                point=(req.point.row, req.point.col) if req.point else None,
            )
        except IllegalMove as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        state = StateSchema.from_game(record.game)

    await broadcast_state(record, state)
    return state


@router.get("/games/{game_id}/sgf", response_class=PlainTextResponse)
async def export_game_sgf(game_id: str) -> PlainTextResponse:
    record = store.get(game_id)
    if not record:
        raise HTTPException(status_code=404, detail="game not found")
    data = export_sgf(record.game)
    return PlainTextResponse(
        content=data.decode("utf-8"),
        media_type="application/x-go-sgf",
        headers={"Content-Disposition": f'attachment; filename="{game_id}.sgf"'},
    )
