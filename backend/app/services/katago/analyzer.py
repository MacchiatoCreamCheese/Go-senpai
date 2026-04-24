from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from .engine import KataGoEngine
from .features import MoveFeatures, extract
from .hashing import position_hash


@dataclass
class AnalyzedMove:
    features: MoveFeatures
    position_hash_before: bytes
    position_hash_after: bytes


@dataclass
class AnalysisResult:
    moves: list[AnalyzedMove]
    visits: int
    katago_version: str
    model_name: str


def _to_katago_coord(coord: str) -> str:
    if coord in ("pass", "resign"):
        return coord
    return coord.upper()


def _katago_moves(db_moves: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Convert DB moves to KataGo (color, coord) pairs.

    Resign is not a move in KataGo's protocol; we truncate at the first resign.
    """
    out: list[tuple[str, str]] = []
    for m in db_moves:
        coord = m["coord"]
        if coord == "resign":
            break
        out.append((m["color"], _to_katago_coord(coord)))
    return out


async def analyze_game(
    *,
    engine: KataGoEngine,
    board_size: int,
    komi: float,
    rules: str,
    db_moves: list[dict[str, Any]],
    visits: int,
) -> AnalysisResult:
    """Run KataGo over a finished game; return per-move features + hashes.

    `db_moves` is the list returned by db.get_moves() — each dict has
    move_number, color ('B'/'W'), coord ('D4'/'pass'/'resign').
    """
    katago_moves = _katago_moves(db_moves)
    if not katago_moves:
        return AnalysisResult(
            moves=[],
            visits=visits,
            katago_version=engine.version,
            model_name=engine.model_name,
        )

    analyze_turns = list(range(len(katago_moves)))
    request = {
        "rules": rules,
        "komi": komi,
        "boardXSize": board_size,
        "boardYSize": board_size,
        "initialStones": [],
        "moves": [list(m) for m in katago_moves],
        "analyzeTurns": analyze_turns,
        "maxVisits": visits,
        "includePolicy": True,
        "includeOwnership": True,
    }

    responses = await engine.analyze(request, expected_turns=analyze_turns)

    out: list[AnalyzedMove] = []
    for idx, (color, kcoord) in enumerate(katago_moves):
        # DB move_number is 1-indexed; idx is 0-indexed (matches KataGo turnNumber).
        db_move = db_moves[idx]
        resp = responses.get(idx)
        feats = extract(
            move_number=db_move["move_number"],
            color=color,
            played_coord=kcoord,
            board_size=board_size,
            katago_response=resp,
        )
        before_moves = katago_moves[:idx]
        after_moves = katago_moves[: idx + 1]
        out.append(
            AnalyzedMove(
                features=feats,
                position_hash_before=position_hash(board_size, komi, rules, before_moves),
                position_hash_after=position_hash(board_size, komi, rules, after_moves),
            )
        )

    # Append features rows for any trailing pass/resign that KataGo skipped.
    for db_move in db_moves[len(katago_moves):]:
        feats = extract(
            move_number=db_move["move_number"],
            color=db_move["color"],
            played_coord=db_move["coord"],
            board_size=board_size,
            katago_response=None,
        )
        h = position_hash(board_size, komi, rules, katago_moves)
        out.append(
            AnalyzedMove(
                features=feats,
                position_hash_before=h,
                position_hash_after=h,
            )
        )

    return AnalysisResult(
        moves=out,
        visits=visits,
        katago_version=engine.version,
        model_name=engine.model_name,
    )


def default_visits() -> int:
    raw = os.environ.get("KATAGO_MAX_VISITS", "500")
    try:
        return int(raw)
    except ValueError:
        return 500


def default_rules() -> str:
    return os.environ.get("KATAGO_RULES", "chinese")
