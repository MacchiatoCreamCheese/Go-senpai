from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .. import db
from ..services.katago import get_engine
from ..services.katago.analyzer import analyze_game, default_rules, default_visits
from ..services.weakness import apply_evidence, extract_evidence
from .auth import soft_user

router = APIRouter(prefix="/api", tags=["analysis"])

AI_USER_ID = "00000000-0000-0000-0000-0000000000a1"

log = logging.getLogger(__name__)


class AnalyzeResponse(BaseModel):
    game_id: UUID
    move_count: int
    visits: int
    katago_version: str
    model_name: str
    cached: bool
    cache_hits: int = 0


class MoveFeatureSchema(BaseModel):
    move_number: int
    color: Literal["B", "W"]
    coord: str
    points_lost: float | None
    policy_rank: int | None
    top_move: str | None
    winrate_before: float | None
    winrate_after: float | None
    score_before: float | None
    score_after: float | None
    phase: Literal["opening", "middlegame", "endgame"]
    is_blunder: bool


class AnalysisResponse(BaseModel):
    game_id: UUID
    features: list[MoveFeatureSchema]


@router.post("/games/{game_id}/analyze", response_model=AnalyzeResponse)
async def analyze(
    game_id: str,
    force: bool = Query(False, description="Re-run even if features already exist"),
    _user=Depends(soft_user),
) -> AnalyzeResponse:
    game = await db.get_game_row(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="game not found")
    if game["ended_at"] is None:
        raise HTTPException(status_code=400, detail="game is not finished")

    engine = get_engine()
    if engine is None or not engine.is_alive():
        raise HTTPException(status_code=503, detail="KataGo engine is not running")

    if not force:
        existing = await db.count_move_features(game_id)
        if existing > 0:
            return AnalyzeResponse(
                game_id=UUID(game_id),
                move_count=existing,
                visits=default_visits(),
                katago_version=engine.version,
                model_name=engine.model_name,
                cached=True,
            )

    moves = await db.get_moves(game_id)
    result = await analyze_game(
        engine=engine,
        board_size=game["board_size"],
        komi=float(game["komi"]),
        rules=default_rules(),
        db_moves=moves,
        visits=default_visits(),
    )

    rows = [
        {
            "move_number": am.features.move_number,
            "position_hash_before": am.position_hash_before,
            "position_hash_after": am.position_hash_after,
            "points_lost": am.features.points_lost,
            "policy_rank": am.features.policy_rank,
            "top_move": am.features.top_move,
            "top_move_points_lost": am.features.top_move_points_lost,
            "winrate_before": am.features.winrate_before,
            "winrate_after": am.features.winrate_after,
            "score_before": am.features.score_before,
            "score_after": am.features.score_after,
            "phase": am.features.phase,
            "is_blunder": am.features.is_blunder,
            "local_context": None,
            "ownership_delta": None,
            "top_pv": am.features.top_pv,
            "score_stdev_before": am.features.score_stdev_before,
        }
        for am in result.moves
    ]
    await db.insert_move_features(game_id, rows)
    await _run_weakness_update(game_id, game)

    return AnalyzeResponse(
        game_id=UUID(game_id),
        move_count=len(rows),
        visits=result.visits,
        katago_version=result.katago_version,
        model_name=result.model_name,
        cached=False,
        cache_hits=result.cache_hits,
    )


async def _run_weakness_update(game_id: str, game: dict) -> None:
    """For each real user in the game, extract and apply weakness evidence.

    Failures here must not fail the /analyze response — just log.
    """
    seats = [
        (game.get("black_user_id"), "B"),
        (game.get("white_user_id"), "W"),
    ]
    try:
        features = await db.get_move_features(game_id)
        for user_id, color in seats:
            if user_id is None:
                continue
            uid = str(user_id)
            if uid == AI_USER_ID:
                continue
            player_features = [f for f in features if f.get("color") == color]
            evidence = extract_evidence(player_features)
            await apply_evidence(uid, game_id, evidence)
    except Exception as exc:  # pragma: no cover — best-effort hook
        log.warning("weakness update failed for game %s: %s", game_id, exc)


@router.get("/games/{game_id}/analysis", response_model=AnalysisResponse)
async def get_analysis(game_id: str) -> AnalysisResponse:
    rows = await db.get_move_features(game_id)
    if not rows:
        raise HTTPException(status_code=404, detail="no analysis for this game")
    features = [
        MoveFeatureSchema(
            move_number=r["move_number"],
            color=r["color"],
            coord=r["coord"],
            points_lost=r["points_lost"],
            policy_rank=r["policy_rank"],
            top_move=r["top_move"],
            winrate_before=r["winrate_before"],
            winrate_after=r["winrate_after"],
            score_before=r["score_before"],
            score_after=r["score_after"],
            phase=r["phase"],
            is_blunder=r["is_blunder"],
        )
        for r in rows
    ]
    return AnalysisResponse(game_id=UUID(game_id), features=features)
