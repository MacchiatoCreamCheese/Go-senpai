from __future__ import annotations

import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from .. import db
from ..engine.board import BLACK, WHITE, color_label
from ..engine.coords import from_coord, to_coord
from ..engine.game import GameState, MoveKind, Status
from ..engine.rules import IllegalMove
from ..engine.sgf import export_sgf
from ..services.katago import ai_player
from ..services.katago.engine import get_engine
from ..schemas import (
    CreateGameRequest,
    CreateUserRequest,
    GameListItem,
    GameSchema,
    JoinGameRequest,
    MoveRequest,
    StateSchema,
    UserSchema,
    color_from_code,
)
from ..sessions import GameRecord, store
from .ws import broadcast_players, broadcast_state

router = APIRouter(prefix="/api", tags=["games"])


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.post("/users", response_model=UserSchema, status_code=201)
async def create_user(req: CreateUserRequest) -> UserSchema:
    row = await db.create_user(req.handle)
    return UserSchema(id=str(row["id"]), handle=row["handle"])


@router.get("/users/{user_id}/games", response_model=list[GameListItem])
async def list_user_games(user_id: str) -> list[GameListItem]:
    rows = await db.list_user_games(user_id)
    return [
        GameListItem(
            id=str(r["id"]),
            board_size=r["board_size"],
            result=r["result"],
            started_at=r["started_at"].isoformat(),
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Games
# ---------------------------------------------------------------------------


async def _load_from_db(game_id: str) -> GameRecord | None:
    """Reconstruct a game from the DB and cache it in-memory."""
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


async def _get_record(game_id: str) -> GameRecord:
    record = store.get(game_id)
    if not record:
        record = await _load_from_db(game_id)
    if not record:
        raise HTTPException(status_code=404, detail="game not found")
    return record


def _nullable_str(value: object | None) -> str | None:
    return str(value) if value else None


AI_USER_ID = "00000000-0000-0000-0000-0000000000a1"


def _game_schema(
    record: GameRecord,
    black_user_id: str | None,
    white_user_id: str | None,
    opponent_type: str = "human",
    ai_rank: int | None = None,
) -> GameSchema:
    return GameSchema(
        id=record.id,
        size=record.game.size,
        komi=record.game.komi,
        black_user_id=black_user_id,
        white_user_id=white_user_id,
        opponent_type=opponent_type,  # type: ignore[arg-type]
        ai_rank=ai_rank,
        state=StateSchema.from_game(record.game),
    )


@router.post("/games", response_model=GameSchema, status_code=201)
async def create_game(req: CreateGameRequest) -> GameSchema:
    game_id = str(uuid4())
    game = GameState.new(size=req.size, komi=req.komi)

    if req.opponent_type == "ai":
        if req.ai_rank is None:
            raise HTTPException(status_code=400, detail="ai_rank is required for AI games")
        # User sits in their chosen colour; the AI takes the opposite seat
        # so the game is immediately full and playable.
        if req.color == "B":
            black_id, white_id = req.user_id, AI_USER_ID
        else:
            black_id, white_id = AI_USER_ID, req.user_id
    else:
        black_id = req.user_id if req.color == "B" else None
        white_id = req.user_id if req.color == "W" else None

    await db.create_game(
        game_id,
        black_id,
        white_id,
        game.size,
        game.komi,
        opponent_type=req.opponent_type,
        ai_rank=req.ai_rank if req.opponent_type == "ai" else None,
    )
    record = store.create(game_id, game)
    return _game_schema(
        record,
        black_id,
        white_id,
        opponent_type=req.opponent_type,
        ai_rank=req.ai_rank,
    )


@router.get("/games/{game_id}", response_model=GameSchema)
async def get_game(game_id: str) -> GameSchema:
    record = await _get_record(game_id)
    row = await db.get_game_row(game_id)
    return _game_schema(
        record,
        _nullable_str(row["black_user_id"]) if row else None,
        _nullable_str(row["white_user_id"]) if row else None,
        opponent_type=(row or {}).get("opponent_type") or "human",
        ai_rank=(row or {}).get("ai_rank"),
    )


@router.post("/games/{game_id}/join", response_model=GameSchema)
async def join_game(game_id: str, req: JoinGameRequest) -> GameSchema:
    record = await _get_record(game_id)
    try:
        seats = await db.claim_empty_seat(game_id, req.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await broadcast_players(record, seats["black_user_id"], seats["white_user_id"])
    return _game_schema(record, seats["black_user_id"], seats["white_user_id"])


@router.post("/games/{game_id}/swap_colors", response_model=GameSchema)
async def swap_colors(game_id: str) -> GameSchema:
    record = await _get_record(game_id)
    try:
        seats = await db.swap_colors(game_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await broadcast_players(record, seats["black_user_id"], seats["white_user_id"])
    return _game_schema(record, seats["black_user_id"], seats["white_user_id"])


@router.post("/games/{game_id}/moves", response_model=StateSchema)
async def play_move(game_id: str, req: MoveRequest) -> StateSchema:
    record = await _get_record(game_id)

    async with record.lock:
        try:
            record.game.play(
                color=color_from_code(req.color),
                kind=MoveKind(req.kind),
                point=(req.point.row, req.point.col) if req.point else None,
            )
        except IllegalMove as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        move = record.game.moves[-1]
        if move.kind == MoveKind.PASS:
            coord = "pass"
        elif move.kind == MoveKind.RESIGN:
            coord = "resign"
        else:
            coord = to_coord(*move.point, record.game.size)  # type: ignore[misc]

        await db.insert_move(
            record.id,
            len(record.game.moves),
            color_label(move.color),
            coord,
        )

        if record.game.status != Status.ACTIVE:
            sgf = export_sgf(record.game).decode()
            await db.finish_game(record.id, record.game.result, sgf)  # type: ignore[arg-type]

        state = StateSchema.from_game(record.game)

    await broadcast_state(record, state)
    return state


@router.post("/games/{game_id}/ai-move", response_model=StateSchema)
async def play_ai_move(game_id: str) -> StateSchema:
    row = await db.get_game_row(game_id)
    if not row:
        raise HTTPException(status_code=404, detail="game not found")
    if row.get("opponent_type") != "ai":
        raise HTTPException(status_code=400, detail="not an AI game")
    ai_rank = row.get("ai_rank")
    if ai_rank is None:
        raise HTTPException(status_code=400, detail="ai_rank missing on game")

    record = await _get_record(game_id)
    engine = get_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="KataGo engine not available")

    # Determine which colour the AI is playing: whichever seat holds AI_USER_ID.
    ai_color = "B" if _nullable_str(row["black_user_id"]) == AI_USER_ID else "W"

    async with record.lock:
        if record.game.status != Status.ACTIVE:
            raise HTTPException(status_code=409, detail="game is not active")
        if color_label(record.game.turn) != ai_color:
            raise HTTPException(status_code=409, detail="it is not the AI's turn")

        try:
            kind, point = await ai_player.choose_move(
                engine=engine,
                game=record.game,
                kyu_rank=int(ai_rank),
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"KataGo error: {exc}")

        try:
            record.game.play(
                color=color_from_code(ai_color),  # type: ignore[arg-type]
                kind=kind,
                point=point,
            )
        except IllegalMove as exc:
            # Extremely rare: sampled move was rejected (e.g. superko). Fall
            # back to pass so the game keeps moving rather than 500-ing.
            logging.getLogger(__name__).warning(
                "AI illegal move %s/%s: %s; passing", kind, point, exc
            )
            record.game.play(
                color=color_from_code(ai_color),  # type: ignore[arg-type]
                kind=MoveKind.PASS,
            )

        move = record.game.moves[-1]
        if move.kind == MoveKind.PASS:
            coord = "pass"
        elif move.kind == MoveKind.RESIGN:
            coord = "resign"
        else:
            coord = to_coord(*move.point, record.game.size)  # type: ignore[misc]

        await db.insert_move(
            record.id,
            len(record.game.moves),
            color_label(move.color),
            coord,
        )

        if record.game.status != Status.ACTIVE:
            sgf = export_sgf(record.game).decode()
            await db.finish_game(record.id, record.game.result, sgf)  # type: ignore[arg-type]

        state = StateSchema.from_game(record.game)

    await broadcast_state(record, state)
    return state


@router.get("/games/{game_id}/sgf", response_class=PlainTextResponse)
async def export_game_sgf(game_id: str) -> PlainTextResponse:
    record = await _get_record(game_id)
    data = export_sgf(record.game)
    return PlainTextResponse(
        content=data.decode("utf-8"),
        media_type="application/x-go-sgf",
        headers={"Content-Disposition": f'attachment; filename="{game_id}.sgf"'},
    )
