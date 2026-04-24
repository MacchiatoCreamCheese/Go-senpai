from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


Phase = Literal["opening", "middlegame", "endgame"]


@dataclass
class Moment:
    move_number: int
    color: str
    coord: str
    top_move: str | None
    points_lost: float
    winrate_before: float | None
    winrate_after: float | None
    score_before: float | None
    score_after: float | None
    phase: Phase
    is_blunder: bool
    kind: Literal["blunder", "critical_decision"]


CRITICAL_POLICY_RANK = 3
CRITICAL_POINTS_LOST = 1.5
DEFAULT_N = 4
MAX_PER_PHASE = 2


def pick_moments(
    features: list[dict[str, Any]],
    player_color: str,
    *,
    n: int = DEFAULT_N,
    max_per_phase: int = MAX_PER_PHASE,
) -> list[Moment]:
    """Pick the top-N instructive moments for a given player.

    Selection: blunders first (scored by points_lost), then critical decisions
    (engine preferred another move, points_lost >= CRITICAL_POINTS_LOST).
    Caps per phase so reviews don't pile up in one stage of the game.
    """
    candidates: list[tuple[float, Moment]] = []
    for row in features:
        if row.get("color") != player_color:
            continue
        points_lost = row.get("points_lost")
        if points_lost is None:
            continue
        coord = str(row.get("coord", ""))
        if coord.lower() in ("pass", "resign"):
            continue

        is_blunder = bool(row.get("is_blunder"))
        policy_rank = row.get("policy_rank")

        kind: Literal["blunder", "critical_decision"] | None = None
        if is_blunder:
            kind = "blunder"
        elif (
            policy_rank is not None
            and policy_rank >= CRITICAL_POLICY_RANK
            and points_lost >= CRITICAL_POINTS_LOST
        ):
            kind = "critical_decision"
        if kind is None:
            continue

        moment = Moment(
            move_number=int(row["move_number"]),
            color=row["color"],
            coord=coord,
            top_move=row.get("top_move"),
            points_lost=float(points_lost),
            winrate_before=_float_or_none(row.get("winrate_before")),
            winrate_after=_float_or_none(row.get("winrate_after")),
            score_before=_float_or_none(row.get("score_before")),
            score_after=_float_or_none(row.get("score_after")),
            phase=row["phase"],
            is_blunder=is_blunder,
            kind=kind,
        )
        # Blunders always outrank critical decisions at the same points_lost.
        priority = float(points_lost) + (1000.0 if is_blunder else 0.0)
        candidates.append((priority, moment))

    candidates.sort(key=lambda x: x[0], reverse=True)

    picked: list[Moment] = []
    phase_counts: dict[str, int] = {"opening": 0, "middlegame": 0, "endgame": 0}
    for _, moment in candidates:
        if len(picked) >= n:
            break
        if phase_counts[moment.phase] >= max_per_phase:
            continue
        picked.append(moment)
        phase_counts[moment.phase] += 1

    picked.sort(key=lambda m: m.move_number)
    return picked


def _float_or_none(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
