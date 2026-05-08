from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from ... import db
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
    cache_hits: int


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

    Uses the cross-game position cache: positions already analyzed at this
    visit count are pulled from `position_analyses` and only fresh positions
    are sent to KataGo.
    """
    katago_moves = _katago_moves(db_moves)
    if not katago_moves:
        return AnalysisResult(
            moves=[],
            visits=visits,
            katago_version=engine.version,
            model_name=engine.model_name,
            cache_hits=0,
        )

    # Position BEFORE each turn T = first T moves.
    hashes_before: list[bytes] = [
        position_hash(board_size, komi, rules, katago_moves[:t])
        for t in range(len(katago_moves))
    ]

    cached = await db.get_cached_analyses(list(set(hashes_before)))
    missing_turns = [t for t, h in enumerate(hashes_before) if h not in cached]

    responses: dict[int, dict[str, Any]] = {}
    if missing_turns:
        request = {
            "rules": rules,
            "komi": komi,
            "boardXSize": board_size,
            "boardYSize": board_size,
            "initialStones": [],
            "moves": [list(m) for m in katago_moves],
            "analyzeTurns": missing_turns,
            "maxVisits": visits,
            "includePolicy": True,
            "includeOwnership": True,
            "includeOwnershipStdev": True,
            "analysisPVLen": 8,
        }
        responses = await engine.analyze(
            request,
            expected_turns=missing_turns,
            timeout=_analyze_timeout(len(missing_turns)),
            priority=0,  # background work; live AI moves (priority=10) preempt
        )

        # Persist fresh responses into the cross-game cache.
        new_entries = []
        seen: set[bytes] = set()
        for t in missing_turns:
            h = hashes_before[t]
            if h in seen:
                continue
            seen.add(h)
            new_entries.append(
                {
                    "position_hash": h,
                    "board_size": board_size,
                    "visits": visits,
                    "katago_version": engine.version,
                    "model_name": engine.model_name,
                    "raw_response": responses[t],
                }
            )
        await db.put_cached_analyses(new_entries)

    out: list[AnalyzedMove] = []
    for idx, (color, kcoord) in enumerate(katago_moves):
        db_move = db_moves[idx]
        resp = responses.get(idx) or cached.get(hashes_before[idx])
        feats = extract(
            move_number=db_move["move_number"],
            color=color,
            played_coord=kcoord,
            board_size=board_size,
            katago_response=resp,
        )
        after_moves = katago_moves[: idx + 1]
        out.append(
            AnalyzedMove(
                features=feats,
                position_hash_before=hashes_before[idx],
                position_hash_after=position_hash(board_size, komi, rules, after_moves),
            )
        )

    # Features rows for any trailing pass/resign that KataGo skipped.
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
        cache_hits=len(hashes_before) - len(missing_turns),
    )


def default_visits() -> int:
    raw = os.environ.get("KATAGO_MAX_VISITS", "500")
    try:
        return int(raw)
    except ValueError:
        return 500


def default_rules() -> str:
    return os.environ.get("KATAGO_RULES", "chinese")


def _analyze_timeout(turn_count: int) -> float:
    """Budget KataGo's wall time per request.

    Override with KATAGO_ANALYZE_TIMEOUT (floor in seconds); otherwise
    scale by KATAGO_TIMEOUT_PER_TURN (default 8s) * turns, with a floor
    of 60s so tiny games aren't rushed.
    """
    floor = _env_float("KATAGO_ANALYZE_TIMEOUT", 60.0)
    per_turn = _env_float("KATAGO_TIMEOUT_PER_TURN", 8.0)
    return max(floor, turn_count * per_turn)


def _env_float(name: str, fallback: float) -> float:
    try:
        return float(os.environ.get(name, fallback))
    except ValueError:
        return fallback
