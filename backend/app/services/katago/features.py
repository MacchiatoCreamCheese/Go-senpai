from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Phase = Literal["opening", "middlegame", "endgame"]

BLUNDER_THRESHOLDS: dict[int, float] = {9: 2.0, 13: 3.0, 19: 5.0}


@dataclass
class MoveFeatures:
    move_number: int
    color: str
    coord: str
    points_lost: float | None
    policy_rank: int | None
    top_move: str | None
    top_move_points_lost: float | None
    winrate_before: float | None
    winrate_after: float | None
    score_before: float | None
    score_after: float | None
    phase: Phase
    is_blunder: bool


def classify_phase(move_number: int, board_size: int) -> Phase:
    area = board_size * board_size
    if move_number < 0.3 * area:
        return "opening"
    if move_number > 0.7 * area:
        return "endgame"
    return "middlegame"


def is_blunder(points_lost: float | None, board_size: int) -> bool:
    if points_lost is None:
        return False
    return points_lost >= BLUNDER_THRESHOLDS.get(board_size, 5.0)


def extract(
    *,
    move_number: int,
    color: str,
    played_coord: str,
    board_size: int,
    katago_response: dict[str, Any] | None,
) -> MoveFeatures:
    """Build a MoveFeatures record from one KataGo turn response.

    `played_coord` is in KataGo notation ('D4', 'pass', 'resign').
    `katago_response` is the response object for the position BEFORE this move.
    For pass/resign or missing analysis, numeric features are None.
    """
    phase = classify_phase(move_number, board_size)

    if (
        katago_response is None
        or played_coord.lower() in ("pass", "resign")
    ):
        return MoveFeatures(
            move_number=move_number,
            color=color,
            coord=played_coord,
            points_lost=None,
            policy_rank=None,
            top_move=None,
            top_move_points_lost=None,
            winrate_before=None,
            winrate_after=None,
            score_before=None,
            score_after=None,
            phase=phase,
            is_blunder=False,
        )

    root = katago_response.get("rootInfo", {})
    move_infos: list[dict[str, Any]] = katago_response.get("moveInfos", [])

    winrate_before = _as_float(root.get("winrate"))
    score_before = _as_float(root.get("scoreLead"))

    top = move_infos[0] if move_infos else None
    top_move = (top.get("move") if top else None)
    top_score = _as_float(top.get("scoreLead")) if top else None

    played_norm = played_coord.upper()
    played = next(
        (m for m in move_infos if str(m.get("move", "")).upper() == played_norm),
        None,
    )

    if played is not None:
        policy_rank = int(played.get("order", 999))
        winrate_after = _as_float(played.get("winrate"))
        score_after = _as_float(played.get("scoreLead"))
    else:
        policy_rank = 999
        winrate_after = None
        score_after = None

    if score_before is not None and score_after is not None:
        points_lost = max(0.0, score_before - score_after)
    elif top_score is not None and score_after is not None:
        points_lost = max(0.0, top_score - score_after)
    else:
        points_lost = None

    return MoveFeatures(
        move_number=move_number,
        color=color,
        coord=played_coord,
        points_lost=points_lost,
        policy_rank=policy_rank,
        top_move=top_move,
        top_move_points_lost=0.0 if top_move is not None else None,
        winrate_before=winrate_before,
        winrate_after=winrate_after,
        score_before=score_before,
        score_after=score_after,
        phase=phase,
        is_blunder=is_blunder(points_lost, board_size),
    )


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
