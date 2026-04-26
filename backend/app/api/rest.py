from __future__ import annotations

import asyncio
import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from .. import db
from ..rate_limit import NEXT_ACTION_LIMIT, limiter
from ..engine.board import BLACK, WHITE, color_label
from ..engine.coords import from_coord, to_coord
from ..engine.game import GameState, MoveKind, Status
from ..engine.rules import IllegalMove
from ..engine.sgf import export_sgf
from ..services.katago import ai_player
from ..services.katago.engine import get_engine
from ..services.katago.features import classify_tier, confidence_weight
from ..services.katago.live_analysis import analyze_single_move, position_hash_pair
from ..schemas import (
    ActionHistoryItem,
    ConceptListItem,
    ConceptSchema,
    CreateGameRequest,
    CreateUserRequest,
    DrillAttemptRequest,
    DrillAttemptSchema,
    GameListItem,
    GameSchema,
    JoinGameRequest,
    MoveRequest,
    NextActionResponse,
    ProblemSchema,
    StateSchema,
    UserConceptItem,
    UserProgressResponse,
    UserSchema,
    WeaknessSchema,
    color_from_code,
)
from ..services.drills import pick_next
from ..services.orchestrator import run_session_step
from ..sessions import GameRecord, store
from .auth import soft_user
from .ws import broadcast_move_tier, broadcast_players, broadcast_state

router = APIRouter(prefix="/api", tags=["games"])


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.post("/users", response_model=UserSchema, status_code=201)
async def create_user(req: CreateUserRequest) -> UserSchema:
    row = await db.create_user(req.handle)
    return UserSchema(id=str(row["id"]), handle=row["handle"])


class UpdateHandleRequest(CreateUserRequest):
    pass


@router.patch("/users/me", response_model=UserSchema)
async def update_my_handle(
    req: UpdateHandleRequest, user=Depends(soft_user)
) -> UserSchema:
    if not user:
        raise HTTPException(status_code=401, detail="auth required to set handle")
    row = await db.update_user_handle(str(user["id"]), req.handle.strip())
    if not row:
        raise HTTPException(status_code=404, detail="user not found")
    return UserSchema(id=str(row["id"]), handle=row["handle"])


@router.get("/users/{user_id}/weaknesses", response_model=list[WeaknessSchema])
async def list_user_weaknesses(user_id: str) -> list[WeaknessSchema]:
    rows = await db.list_user_weaknesses(user_id)
    return [
        WeaknessSchema(
            theme=r["theme"],
            severity=float(r["severity"]),
            evidence_count=int(r["evidence_count"]),
            last_seen_at=r["last_seen_at"].isoformat() if r["last_seen_at"] else None,
        )
        for r in rows
    ]


@router.get("/users/{user_id}/concepts", response_model=list[UserConceptItem])
async def list_user_concepts(user_id: str) -> list[UserConceptItem]:
    rows = await db.list_user_concept_progress(user_id)
    return [
        UserConceptItem(
            concept_id=r["concept_id"],
            title=r["title"],
            times_taught=int(r["times_taught"]),
            last_taught_at=r["last_taught_at"].isoformat() if r["last_taught_at"] else None,
            demonstrated=bool(r["demonstrated"]),
        )
        for r in rows
    ]


@router.get("/users/{user_id}/progress", response_model=UserProgressResponse)
async def get_user_progress(user_id: str) -> UserProgressResponse:
    series = await db.user_progress_series(user_id)
    return UserProgressResponse(**series)


@router.get("/concepts", response_model=list[ConceptListItem])
async def list_all_concepts(tag: str | None = None) -> list[ConceptListItem]:
    rows = await db.list_concepts()
    if tag:
        rows = [r for r in rows if tag in (r.get("tags") or [])]
    return [
        ConceptListItem(id=r["id"], title=r["title"], tags=list(r["tags"] or []))
        for r in rows
    ]


@router.get("/concepts/{concept_id}", response_model=ConceptSchema)
async def get_concept_detail(concept_id: str) -> ConceptSchema:
    row = await db.get_concept(concept_id)
    if not row:
        raise HTTPException(status_code=404, detail="concept not found")
    return ConceptSchema(
        id=row["id"], title=row["title"], body_md=row["body_md"], tags=list(row["tags"] or []),
    )


@router.get("/users/{user_id}/next-problem", response_model=ProblemSchema)
async def get_next_problem(user_id: str) -> ProblemSchema:
    problem = await pick_next(user_id)
    if problem is None:
        raise HTTPException(status_code=404, detail="no problems available")
    return ProblemSchema(
        id=problem["id"],
        sgf=problem["sgf"],
        solution=problem["solution"],
        themes=list(problem["themes"] or []),
        difficulty=int(problem["difficulty"]),
        source=problem.get("source"),
    )


@router.get("/problems/{problem_id}", response_model=ProblemSchema)
async def get_problem_by_id(problem_id: str) -> ProblemSchema:
    problem = await db.get_problem(problem_id)
    if problem is None:
        raise HTTPException(status_code=404, detail="problem not found")
    return ProblemSchema(
        id=problem["id"],
        sgf=problem["sgf"],
        solution=problem["solution"],
        themes=list(problem["themes"] or []),
        difficulty=int(problem["difficulty"]),
        source=problem.get("source"),
    )


@router.post("/drill-attempts", response_model=DrillAttemptSchema, status_code=201)
async def create_drill_attempt(
    req: DrillAttemptRequest, _user=Depends(soft_user)
) -> DrillAttemptSchema:
    row = await db.record_drill_attempt(
        req.user_id,
        req.problem_id,
        req.success,
        req.moves_played,
        req.hint_used,
    )
    return DrillAttemptSchema(
        id=int(row["id"]),
        user_id=str(row["user_id"]),
        problem_id=str(row["problem_id"]),
        attempted_at=row["attempted_at"].isoformat(),
        success=bool(row["success"]),
    )


@router.post("/users/{user_id}/next-action", response_model=NextActionResponse)
@limiter.limit(NEXT_ACTION_LIMIT)
async def next_action(
    request: Request,
    user_id: str,
    _user=Depends(soft_user),
) -> NextActionResponse:
    result = await run_session_step(user_id)
    kind = result["kind"]
    if kind == "review_game":
        return NextActionResponse(kind="review_game", game_id=str(result["game_id"]), reason=result.get("reason", ""))
    if kind == "serve_drill":
        p = result["problem"]
        return NextActionResponse(
            kind="serve_drill",
            reason=result.get("reason", ""),
            problem=ProblemSchema(
                id=p["id"],
                sgf=p["sgf"],
                solution=p["solution"],
                themes=list(p["themes"] or []),
                difficulty=int(p["difficulty"]),
                source=p.get("source"),
            ),
        )
    if kind in ("teach_concept", "revisit_concept"):
        c = result["concept"]
        return NextActionResponse(
            kind=kind,
            reason=result.get("reason", ""),
            concept=ConceptSchema(
                id=c["id"],
                title=c["title"],
                body_md=c["body_md"],
                tags=list(c.get("tags") or []),
            ),
        )
    return NextActionResponse(kind="idle", reason=result.get("reason", ""))


@router.get("/users/{user_id}/action-history", response_model=list[ActionHistoryItem])
async def get_action_history(user_id: str, limit: int = 20) -> list[ActionHistoryItem]:
    rows = await db.list_action_history(user_id, limit=limit)
    return [
        ActionHistoryItem(
            id=r["id"],
            kind=r["kind"],
            game_id=str(r["game_id"]) if r.get("game_id") else None,
            problem_id=r.get("problem_id"),
            concept_id=r.get("concept_id"),
            reason=r.get("reason"),
            picked_at=r["picked_at"].isoformat(),
        )
        for r in rows
    ]


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
    training_mode: bool = False,
) -> GameSchema:
    return GameSchema(
        id=record.id,
        size=record.game.size,
        komi=record.game.komi,
        black_user_id=black_user_id,
        white_user_id=white_user_id,
        opponent_type=opponent_type,  # type: ignore[arg-type]
        ai_rank=ai_rank,
        training_mode=training_mode,
        state=StateSchema.from_game(record.game),
    )


@router.post("/games", response_model=GameSchema, status_code=201)
async def create_game(req: CreateGameRequest, _user=Depends(soft_user)) -> GameSchema:
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
        training_mode=req.training_mode if req.opponent_type == "ai" else False,
    )
    record = store.create(game_id, game)
    return _game_schema(
        record,
        black_id,
        white_id,
        opponent_type=req.opponent_type,
        ai_rank=req.ai_rank,
        training_mode=req.training_mode if req.opponent_type == "ai" else False,
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
        training_mode=bool((row or {}).get("training_mode", False)),
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
async def play_move(game_id: str, req: MoveRequest, _user=Depends(soft_user)) -> StateSchema:
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
async def play_ai_move(game_id: str, _user=Depends(soft_user)) -> StateSchema:
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

    # Kick off live analysis of the user's last move concurrently (training mode only).
    analyze_task: asyncio.Task | None = None
    if row.get("training_mode"):
        db_moves_for_analysis = await db.get_moves(game_id)
        if db_moves_for_analysis:
            analyze_task = asyncio.create_task(
                _live_analyze_and_push(game_id, row, db_moves_for_analysis, record)
            )

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
    # analyze_task runs in background; move_tier arrives via WS after this returns
    return state


@router.post("/games/{game_id}/undo", response_model=StateSchema)
async def undo_move(game_id: str, _user=Depends(soft_user)) -> StateSchema:
    row = await db.get_game_row(game_id)
    if not row:
        raise HTTPException(status_code=404, detail="game not found")
    if row["opponent_type"] != "ai":
        raise HTTPException(status_code=400, detail="undo only available in AI games")
    if row["ended_at"] is not None:
        raise HTTPException(status_code=400, detail="game is already finished")

    black_id = _nullable_str(row["black_user_id"])
    player_color = "W" if black_id == AI_USER_ID else "B"
    ai_color = "B" if player_color == "W" else "W"

    record = await _get_record(game_id)
    async with record.lock:
        moves = await db.get_moves(game_id)
        if len(moves) < 2:
            raise HTTPException(status_code=400, detail="nothing to undo")
        last, second_last = moves[-1], moves[-2]
        if last["color"] != ai_color or second_last["color"] != player_color:
            raise HTTPException(status_code=400, detail="cannot undo right now")

        await db.truncate_moves(game_id, second_last["move_number"])

        # Rebuild game state in-place from remaining moves
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
        record.game = game
        state = StateSchema.from_game(record.game)

    await broadcast_state(record, state)
    return state


async def _live_analyze_and_push(
    game_id: str,
    game_row: dict,
    db_moves: list[dict],
    record: GameRecord,
) -> None:
    """Analyze the last user move at reduced visits and broadcast the tier."""
    engine = get_engine()
    if engine is None:
        return
    log = logging.getLogger(__name__)
    try:
        feats = await analyze_single_move(
            engine=engine,
            board_size=game_row["board_size"],
            komi=float(game_row["komi"]),
            rules=game_row.get("ruleset", "chinese"),
            db_moves=db_moves,
        )
        if feats is None:
            return

        cpl = feats.confident_points_lost
        tier = classify_tier(cpl, game_row["board_size"])
        await broadcast_move_tier(record, feats.move_number, tier)
    except Exception as exc:
        logging.getLogger(__name__).warning("live analysis failed: %s", exc)


@router.get("/games/{game_id}/sgf", response_class=PlainTextResponse)
async def export_game_sgf(game_id: str) -> PlainTextResponse:
    record = await _get_record(game_id)
    features = await db.get_move_features(game_id)
    data = export_sgf(record.game, features=features or None)
    return PlainTextResponse(
        content=data.decode("utf-8"),
        media_type="application/x-go-sgf",
        headers={"Content-Disposition": f'attachment; filename="{game_id}.sgf"'},
    )


# ---------------------------------------------------------------------------
# Player move notes
# ---------------------------------------------------------------------------


class PlayerNoteBody(BaseModel):
    user_id: str
    body: str


@router.put("/games/{game_id}/moves/{move_number}/player-note", status_code=204)
async def put_player_note(
    game_id: str,
    move_number: int,
    req: PlayerNoteBody,
    _user=Depends(soft_user),
) -> None:
    if not req.body.strip():
        raise HTTPException(400, "body cannot be empty")
    if len(req.body) > 300:
        raise HTTPException(400, "note too long (max 300 chars)")
    game = await db.get_game_row(game_id)
    if not game:
        raise HTTPException(404, "game not found")
    await db.upsert_player_move_note(game_id, move_number, req.user_id, req.body.strip())


@router.get("/games/{game_id}/player-notes")
async def get_player_notes(
    game_id: str,
    user_id: str = Query(...),
    _user=Depends(soft_user),
) -> dict[str, str]:
    raw = await db.get_player_move_notes(game_id, user_id)
    return {str(k): v for k, v in raw.items()}
