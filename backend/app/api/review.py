from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from .. import db
from ..rate_limit import REVIEW_LIMIT, limiter
from ..services.review.llm import LLMError
from ..services.review.note_generator import get_or_generate_note
from ..services.review.reviewer import ReviewError, generate_review
from .auth import soft_user


def _http_for_llm_error(exc: LLMError) -> HTTPException:
    """Misconfiguration → 500; provider outage / overload → 503."""
    msg = str(exc)
    if "is not set" in msg or "unknown REVIEW_LLM_PROVIDER" in msg:
        return HTTPException(status_code=500, detail=msg)
    return HTTPException(status_code=503, detail=msg)


router = APIRouter(prefix="/api", tags=["review"])


class MoveNoteResponse(BaseModel):
    tier: str
    body_md: str
    concept_ids: list[str]
    model: str
    generated_at: datetime


class ReviewMoment(BaseModel):
    move_number: int
    coord: str
    color: str
    top_move: str | None
    points_lost: float
    phase: str
    kind: str
    explanation_md: str
    concept_ids: list[str]
    top_pv: list[str] | None = None


class ReviewResponse(BaseModel):
    id: UUID
    game_id: UUID
    for_user_id: UUID
    generated_at: datetime
    model: str
    summary_md: str
    moments: list[ReviewMoment]
    cost_tokens: int | None


def _row_to_response(row: dict[str, Any]) -> ReviewResponse:
    return ReviewResponse(
        id=row["id"],
        game_id=row["game_id"],
        for_user_id=row["for_user_id"],
        generated_at=row["generated_at"],
        model=row["model"],
        summary_md=row["summary_md"],
        moments=[ReviewMoment(**m) for m in row["moments"]],
        cost_tokens=row.get("cost_tokens"),
    )


@router.post("/games/{game_id}/review", response_model=ReviewResponse)
@limiter.limit(REVIEW_LIMIT)
async def create_review(
    request: Request,
    game_id: str,
    for_user_id: str = Query(..., description="User to generate the review for"),
    force: bool = Query(False, description="Regenerate even if a review exists"),
    _user=Depends(soft_user),
) -> ReviewResponse:
    if not force:
        existing = await db.get_review(game_id, for_user_id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail="review already exists; pass force=true to regenerate",
            )
    try:
        row = await generate_review(game_id=game_id, for_user_id=for_user_id)
    except ReviewError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except LLMError as e:
        raise _http_for_llm_error(e) from e
    return _row_to_response(row)


@router.get("/games/{game_id}/moves/{move_number}/note", response_model=MoveNoteResponse)
async def get_move_note(
    game_id: str,
    move_number: int,
    for_user_id: str = Query(...),
    _user=Depends(soft_user),
) -> MoveNoteResponse:
    game = await db.get_game_row(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="game not found")
    try:
        note = await get_or_generate_note(
            game_id=game_id,
            move_number=move_number,
            for_user_id=for_user_id,
            board_size=game["board_size"],
        )
    except LLMError as e:
        raise _http_for_llm_error(e) from e
    if note is None:
        raise HTTPException(status_code=404, detail="no note for green moves")
    for concept_id in note.get("concept_ids") or []:
        try:
            await db.record_concept_taught(for_user_id, concept_id)
        except Exception:
            pass
    return MoveNoteResponse(**note)


@router.get("/games/{game_id}/review", response_model=ReviewResponse)
async def get_review(
    game_id: str,
    for_user_id: str = Query(...),
) -> ReviewResponse:
    row = await db.get_review(game_id, for_user_id)
    if not row:
        raise HTTPException(status_code=404, detail="no review for this game/user")
    return _row_to_response(row)
