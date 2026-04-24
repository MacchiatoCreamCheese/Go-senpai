from __future__ import annotations

from typing import Any

from ... import db
from .llm import LLMClient, build_default_client, extract_json_object
from .prompt import build_review_prompt
from .retriever import retrieve_for_moments
from .selector import Moment, pick_moments


class ReviewError(RuntimeError):
    pass


async def generate_review(
    *,
    game_id: str,
    for_user_id: str,
    client: LLMClient | None = None,
) -> dict[str, Any]:
    """Run the full pipeline and persist the review. Returns the stored row."""
    game = await db.get_game_row(game_id)
    if not game:
        raise ReviewError("game not found")
    if game["ended_at"] is None:
        raise ReviewError("game is not finished")

    player_color = _player_color(game, for_user_id)
    if player_color is None:
        raise ReviewError("user did not play in this game")

    features = await db.get_move_features(game_id)
    if not features:
        raise ReviewError("game has no KataGo analysis; run /analyze first")

    moments = pick_moments(features, player_color)
    if not moments:
        # No blunders or critical decisions — still return a tidy empty review.
        stored = await db.insert_review(
            game_id=game_id,
            for_user_id=for_user_id,
            model="n/a",
            summary_md="No significant mistakes or critical decisions were "
                       "detected for this player in this game.",
            moments=[],
            cost_tokens=0,
        )
        return stored

    concepts = await retrieve_for_moments(moments)
    system, user = build_review_prompt(
        game=game,
        player_color=player_color,
        moments=moments,
        concepts_per_moment=concepts,
    )

    llm = client or build_default_client()
    raw, tokens = await llm.generate_review(system, user)
    parsed = extract_json_object(raw)

    summary_md = str(parsed.get("summary_md", "")).strip()
    moments_payload = _normalize_moments(parsed.get("moments", []), moments)
    if not summary_md or not moments_payload:
        raise ReviewError(f"LLM returned incomplete review: {raw[:200]}")

    stored = await db.insert_review(
        game_id=game_id,
        for_user_id=for_user_id,
        model=llm.model,
        summary_md=summary_md,
        moments=moments_payload,
        cost_tokens=tokens,
    )
    return stored


def _player_color(game: dict[str, Any], user_id: str) -> str | None:
    if str(game.get("black_user_id")) == str(user_id):
        return "B"
    if str(game.get("white_user_id")) == str(user_id):
        return "W"
    return None


def _normalize_moments(
    raw: Any, selected: list[Moment]
) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    by_num = {m.move_number: m for m in selected}
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        mn = item.get("move_number")
        try:
            mn = int(mn)
        except (TypeError, ValueError):
            continue
        base = by_num.get(mn)
        if base is None:
            continue
        explanation = str(item.get("explanation_md", "")).strip()
        if not explanation:
            continue
        concept_ids = [
            str(c) for c in (item.get("concept_ids") or []) if isinstance(c, (str, int))
        ]
        out.append(
            {
                "move_number": base.move_number,
                "coord": base.coord,
                "color": base.color,
                "top_move": base.top_move,
                "points_lost": round(base.points_lost, 2),
                "phase": base.phase,
                "kind": base.kind,
                "explanation_md": explanation,
                "concept_ids": concept_ids,
            }
        )
    return out
