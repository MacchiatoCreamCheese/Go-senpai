from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

Phase = Literal["opening", "middlegame", "endgame"]

BLUNDER_THRESHOLDS: dict[int, float] = {9: 2.0, 13: 3.0, 19: 5.0}

# (yellow_min, red_min) — red_min intentionally equals BLUNDER_THRESHOLDS
TIER_THRESHOLDS: dict[int, tuple[float, float]] = {
    9:  (0.8, 2.0),
    13: (1.0, 3.0),
    19: (1.5, 5.0),
}

# scoreStdev in points. KataGo reports high values early (>10 on 19x19) when
# it's uncertain about final score. Full signal when stdev <= 2pt; linearly
# decayed to a floor of 0.3 at stdev >= 10pt. The floor keeps clear blunders
# registering even in noisy positions.
_CONFIDENCE_LOW_STDEV = 2.0
_CONFIDENCE_HIGH_STDEV = 10.0
_CONFIDENCE_FLOOR = 0.3
_PV_LEN = 8


@dataclass
class MoveFeatures:
    move_number: int
    color: str
    coord: str
    points_lost: float | None          # raw scoreLead diff, unweighted
    policy_rank: int | None
    top_move: str | None
    top_move_points_lost: float | None
    winrate_before: float | None
    winrate_after: float | None
    score_before: float | None
    score_after: float | None
    phase: Phase
    is_blunder: bool
    top_pv: list[str] | None = None
    score_stdev_before: float | None = None
    confident_points_lost: float | None = None  # points_lost * confidence_weight


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


def confidence_weight(score_stdev: float | None) -> float:
    """Return a multiplier in [_CONFIDENCE_FLOOR, 1.0] for points-lost.

    scoreStdev is roughly a 1-sigma confidence interval on scoreLead in
    points. Below ~2pt we trust the score diff fully; above ~10pt it's
    mostly noise and we downgrade (but don't zero) the signal.
    """
    if score_stdev is None:
        return 1.0
    if score_stdev <= _CONFIDENCE_LOW_STDEV:
        return 1.0
    if score_stdev >= _CONFIDENCE_HIGH_STDEV:
        return _CONFIDENCE_FLOOR
    span = _CONFIDENCE_HIGH_STDEV - _CONFIDENCE_LOW_STDEV
    t = (score_stdev - _CONFIDENCE_LOW_STDEV) / span
    return 1.0 - t * (1.0 - _CONFIDENCE_FLOOR)


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
    score_stdev_before = _as_float(root.get("scoreStdev"))

    top = move_infos[0] if move_infos else None
    top_move = (top.get("move") if top else None)
    top_score = _as_float(top.get("scoreLead")) if top else None
    top_pv = _trim_pv(top.get("pv") if top else None)

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

    confident_points_lost = (
        None if points_lost is None
        else points_lost * confidence_weight(score_stdev_before)
    )

    if top_score is not None and score_before is not None:
        top_move_points_lost = max(0.0, top_score - score_before)
    elif top_move is not None:
        top_move_points_lost = 0.0
    else:
        top_move_points_lost = None

    return MoveFeatures(
        move_number=move_number,
        color=color,
        coord=played_coord,
        points_lost=points_lost,
        policy_rank=policy_rank,
        top_move=top_move,
        top_move_points_lost=top_move_points_lost,
        winrate_before=winrate_before,
        winrate_after=winrate_after,
        score_before=score_before,
        score_after=score_after,
        phase=phase,
        is_blunder=is_blunder(confident_points_lost, board_size),
        top_pv=top_pv,
        score_stdev_before=score_stdev_before,
        confident_points_lost=confident_points_lost,
    )


def _trim_pv(pv: Any) -> list[str] | None:
    if not isinstance(pv, list) or not pv:
        return None
    out = [str(m) for m in pv[:_PV_LEN] if isinstance(m, (str, int))]
    return out or None


def classify_tier(points_lost: float | None, board_size: int) -> str:
    """Return 'green' | 'yellow' | 'red'. Pass confident_points_lost when available."""
    if points_lost is None:
        return "green"
    yellow_min, red_min = TIER_THRESHOLDS.get(board_size, (1.5, 5.0))
    if points_lost >= red_min:
        return "red"
    if points_lost >= yellow_min:
        return "yellow"
    return "green"


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
