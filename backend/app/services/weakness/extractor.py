"""Feature-derived weakness evidence.

Given the `move_features` rows for one player in one game, emit a per-theme
evidence score in [0,1]. Pure function: no DB, no LLM. The whole point is
deterministic honesty — downstream (updater, planner) can trust these numbers.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..katago.features import confidence_weight


THEMES: tuple[str, ...] = (
    "blunder_opening",
    "blunder_middlegame",
    "blunder_endgame",
    "ignored_top_move",
    "low_consistency_opening",
    "low_consistency_endgame",
)

_IGNORED_TOP_RANK = 5
_IGNORED_TOP_MIN_POINTS = 1.0
_CONSISTENCY_OPENING_THRESHOLD = 1.5
_CONSISTENCY_ENDGAME_THRESHOLD = 1.0


@dataclass
class ThemeEvidence:
    theme: str
    score: float           # [0, 1]
    supporting_moves: int  # count of moves that contributed (debug / logging)


def _confident(points_lost: float | None, stdev: float | None) -> float | None:
    if points_lost is None:
        return None
    return points_lost * confidence_weight(stdev)


def extract_evidence(features: list[dict[str, Any]]) -> list[ThemeEvidence]:
    """Return one ThemeEvidence per theme in THEMES.

    `features` should already be filtered to a single player's colour. Pass
    moves (coord == 'pass') and resigns are skipped for rate-based themes —
    they contribute neither blunder-opportunity nor blunder-event.

    Themes with zero opportunity moves still return score=0 so the caller's
    EMA can decay past weaknesses when a game has no evidence for them.
    """
    phase_counts = {"opening": 0, "middlegame": 0, "endgame": 0}
    phase_blunders = {"opening": 0, "middlegame": 0, "endgame": 0}
    phase_conf_sum = {"opening": 0.0, "endgame": 0.0}
    phase_conf_count = {"opening": 0, "endgame": 0}

    ignored_opportunities = 0
    ignored_hits = 0

    for f in features:
        coord = f.get("coord")
        if coord in ("pass", "resign") or coord is None:
            continue
        phase = f.get("phase")
        if phase not in phase_counts:
            continue
        phase_counts[phase] += 1
        if f.get("is_blunder"):
            phase_blunders[phase] += 1

        rank = f.get("policy_rank")
        points_lost = f.get("points_lost")
        if rank is not None and points_lost is not None:
            ignored_opportunities += 1
            if rank >= _IGNORED_TOP_RANK and points_lost >= _IGNORED_TOP_MIN_POINTS:
                ignored_hits += 1

        if phase in ("opening", "endgame"):
            conf = _confident(points_lost, f.get("score_stdev_before"))
            if conf is not None:
                phase_conf_sum[phase] += conf
                phase_conf_count[phase] += 1

    def _rate(hits: int, opps: int) -> float:
        if opps <= 0:
            return 0.0
        return max(0.0, min(1.0, hits / opps))

    def _consistency(phase: str, threshold: float) -> tuple[float, int]:
        n = phase_conf_count[phase]
        if n == 0:
            return 0.0, 0
        mean = phase_conf_sum[phase] / n
        return max(0.0, min(1.0, mean / threshold)), n

    open_cons_score, open_cons_n = _consistency("opening", _CONSISTENCY_OPENING_THRESHOLD)
    end_cons_score, end_cons_n = _consistency("endgame", _CONSISTENCY_ENDGAME_THRESHOLD)

    return [
        ThemeEvidence(
            "blunder_opening",
            _rate(phase_blunders["opening"], phase_counts["opening"]),
            phase_blunders["opening"],
        ),
        ThemeEvidence(
            "blunder_middlegame",
            _rate(phase_blunders["middlegame"], phase_counts["middlegame"]),
            phase_blunders["middlegame"],
        ),
        ThemeEvidence(
            "blunder_endgame",
            _rate(phase_blunders["endgame"], phase_counts["endgame"]),
            phase_blunders["endgame"],
        ),
        ThemeEvidence(
            "ignored_top_move",
            _rate(ignored_hits, ignored_opportunities),
            ignored_hits,
        ),
        ThemeEvidence("low_consistency_opening", open_cons_score, open_cons_n),
        ThemeEvidence("low_consistency_endgame", end_cons_score, end_cons_n),
    ]
