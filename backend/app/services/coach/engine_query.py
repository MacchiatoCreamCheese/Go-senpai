from __future__ import annotations

from typing import Any

from ..katago.engine import KataGoEngine

COACH_VISITS = 40
COACH_PRIORITY = 3
COACH_TIMEOUT = 5.0


async def query_current_position(
    *,
    engine: KataGoEngine,
    board_size: int,
    komi: float,
    rules: str,
    db_moves: list[dict[str, Any]],
    include_ownership: bool = False,
) -> dict[str, Any] | None:
    """Run a 40-visit analysis on the current board position."""
    if not db_moves:
        return None

    moves = [[m["color"], m["coord"]] for m in db_moves]
    current_turn = len(moves)

    request: dict[str, Any] = {
        "rules": rules,
        "komi": komi,
        "boardXSize": board_size,
        "boardYSize": board_size,
        "initialStones": [],
        "moves": moves,
        "analyzeTurns": [current_turn],
        "maxVisits": COACH_VISITS,
        "includePolicy": True,
        "includeOwnership": include_ownership,
        "analysisPVLen": 3,
    }

    results = await engine.analyze(
        request, [current_turn], timeout=COACH_TIMEOUT, priority=COACH_PRIORITY
    )
    return results.get(current_turn)
