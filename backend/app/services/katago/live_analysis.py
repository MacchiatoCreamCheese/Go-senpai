from __future__ import annotations

import os
from typing import Any

from .engine import KataGoEngine
from .features import MoveFeatures, extract
from .hashing import position_hash

LIVE_VISITS = int(os.environ.get("KATAGO_LIVE_VISITS", "80"))
LIVE_PRIORITY = 5
LIVE_TIMEOUT = 8.0


def _to_katago_coord(coord: str) -> str:
    return coord if coord in ("pass", "resign") else coord.upper()


def db_moves_to_katago_tuples(db_moves: list[dict[str, Any]]) -> list[tuple[str, str]]:
    """Same move list shape as KataGo analysis requests (truncate before resign)."""
    katago_moves: list[tuple[str, str]] = []
    for m in db_moves:
        if m["coord"] == "resign":
            break
        katago_moves.append((str(m["color"]), _to_katago_coord(str(m["coord"]))))
    return katago_moves


async def analyze_single_move(
    *,
    engine: KataGoEngine,
    board_size: int,
    komi: float,
    rules: str,
    db_moves: list[dict[str, Any]],
) -> MoveFeatures | None:
    """Analyze the last move in db_moves at reduced visit count.

    Returns MoveFeatures or None if the move is pass/resign or unanalyzable.
    """
    if not db_moves:
        return None

    last = db_moves[-1]
    played_coord = last["coord"]
    if played_coord in ("pass", "resign"):
        return None

    katago_moves = db_moves_to_katago_tuples(db_moves)

    # We want to analyze the position BEFORE the last move (turn index = len-2
    # if 0-indexed, but KataGo's analyzeTurns is 0-based count of moves played
    # before that turn, so it equals len(katago_moves) - 1).
    analyze_turn = len(katago_moves) - 1
    if analyze_turn < 0:
        return None

    request = {
        "rules": rules,
        "komi": komi,
        "boardXSize": board_size,
        "boardYSize": board_size,
        "initialStones": [],
        "moves": [list(m) for m in katago_moves],
        "analyzeTurns": [analyze_turn],
        "maxVisits": LIVE_VISITS,
        "includePolicy": False,
        "includeOwnership": False,
        "analysisPVLen": 4,
    }

    responses = await engine.analyze(
        request,
        expected_turns=[analyze_turn],
        timeout=LIVE_TIMEOUT,
        priority=LIVE_PRIORITY,
    )

    resp = responses.get(analyze_turn)
    return extract(
        move_number=last["move_number"],
        color=last["color"],
        played_coord=_to_katago_coord(played_coord),
        board_size=board_size,
        katago_response=resp,
    )


def position_hash_pair(
    board_size: int,
    komi: float,
    rules: str,
    katago_moves: list[tuple[str, str]],
) -> tuple[bytes, bytes]:
    """Return (hash_before_last, hash_after_last) for a completed move list."""
    before = position_hash(board_size, komi, rules, katago_moves[:-1])
    after = position_hash(board_size, komi, rules, katago_moves)
    return before, after
