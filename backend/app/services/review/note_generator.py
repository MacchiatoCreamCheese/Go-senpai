from __future__ import annotations

from typing import Any

from ... import db
from ..katago.features import classify_tier, confidence_weight
from .llm import LLMClient, LLMError, build_default_client, extract_json_object
from .note_prompt import build_note_prompt
from .retriever import RetrievedConcept, retrieve_for_moment
from .selector import Moment


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


def _confident_points_lost(feature: dict[str, Any]) -> float | None:
    pl = feature.get("points_lost")
    if pl is None:
        return None
    stdev = feature.get("score_stdev_before")
    return float(pl) * confidence_weight(float(stdev) if stdev is not None else None)


def _feature_to_moment(feature: dict[str, Any], tier: str) -> Moment:
    pl = float(feature.get("points_lost") or 0.0)
    confident_pl = _confident_points_lost(feature) or pl
    return Moment(
        move_number=int(feature["move_number"]),
        color=feature["color"],
        coord=feature["coord"],
        top_move=feature.get("top_move"),
        points_lost=pl,
        confident_points_lost=confident_pl,
        winrate_before=_f(feature.get("winrate_before")),
        winrate_after=_f(feature.get("winrate_after")),
        score_before=_f(feature.get("score_before")),
        score_after=_f(feature.get("score_after")),
        phase=feature["phase"],
        is_blunder=(tier == "red"),
        kind="blunder" if tier == "red" else "critical_decision",
        top_pv=feature.get("top_pv"),
    )


def _f(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


async def get_or_generate_note(
    *,
    game_id: str,
    move_number: int,
    for_user_id: str,
    board_size: int,
    client: LLMClient | None = None,
) -> dict[str, Any] | None:
    """Return a note dict or None if the move is green (no note by design)."""
    features = await db.get_move_features(game_id)
    feature = next((f for f in features if f["move_number"] == move_number), None)
    if feature is None:
        return None

    tier = classify_tier(feature.get("points_lost"), board_size)
    if tier == "green":
        return None

    cached = await db.get_move_note(game_id, move_number, for_user_id)
    if cached:
        return cached

    moment = _feature_to_moment(feature, tier)
    concepts: list[RetrievedConcept] = await retrieve_for_moment(moment, limit=2)

    user_row = await db.get_user(for_user_id)
    rank_label = _rank_label(user_row.get("rank_estimate") if user_row else None)

    llm = client or build_default_client()
    system, user_prompt = build_note_prompt(
        feature=feature,
        concepts=[{"id": c.id, "title": c.title} for c in concepts],
        rank_label=rank_label,
    )
    raw, _ = await llm.generate_review(system, user_prompt)
    parsed = extract_json_object(raw)

    body_md = str(parsed.get("body_md", "")).strip()
    concept_ids = [c for c in parsed.get("concept_ids", []) if isinstance(c, str)]

    return await db.insert_move_note(
        game_id=game_id,
        move_number=move_number,
        for_user_id=for_user_id,
        tier=tier,
        body_md=body_md,
        concept_ids=concept_ids,
        model=llm.model,
    )
