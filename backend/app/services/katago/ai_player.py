"""Rank-calibrated KataGo opponent.

Uses KataGo's 1-visit policy head as the move distribution, then weakens play
via two knobs ported from KaTrain (sanderland/katrain, MIT):

1. `pick_n`: restrict to the top-N policy moves (tighter for weaker ranks).
2. `weaken_fac`: flatten the policy via p^(1/weaken_fac), then sample.

Kyu convention: positive = kyu (weaker), non-positive = dan. e.g. 15 → 15k,
0 → 1d, -2 → 3d.
"""

from __future__ import annotations

import logging
import math
import os
import random
from bisect import bisect_left
from typing import Any

from ...engine.coords import from_coord, to_coord
from ...engine.game import GameState, MoveKind, Status
from ...engine.board import BLACK, WHITE, color_label
from .engine import KataGoEngine

log = logging.getLogger(__name__)


# KaTrain's ELO calibration tables (from katrain/core/constants.py).
# Each is a sorted list of (param_value, elo) pairs.
_CALIBRATED_RANK_ELO = [
    (18, -21.68), (17, 42.60), (16, 106.88), (15, 171.17), (14, 235.45),
    (13, 299.73), (12, 364.01), (11, 428.29), (10, 492.58), (9, 556.86),
    (8, 621.14), (7, 685.42), (6, 749.70), (5, 813.99), (4, 878.27),
    (3, 942.55), (2, 1006.83), (1, 1071.11), (0, 1135.39), (-1, 1199.68),
    (-2, 1263.96), (-4, 1700.0),
]
_AI_WEIGHTED_ELO = [
    (3.0, 219.87), (2.5, 410.97), (2.0, 575.36), (1.75, 630.15),
    (1.5, 848.94), (1.25, 1042.25), (1.0, 1269.99), (0.5, 1591.57),
]


def _rank_to_elo(kyu: int) -> float:
    """Interpolate rank → expected ELO using KaTrain's calibration table."""
    pairs = sorted(_CALIBRATED_RANK_ELO, key=lambda p: p[0])
    ranks = [p[0] for p in pairs]
    elos = [p[1] for p in pairs]
    if kyu <= ranks[0]:
        return elos[0]
    if kyu >= ranks[-1]:
        return elos[-1]
    i = bisect_left(ranks, kyu)
    r0, r1 = ranks[i - 1], ranks[i]
    e0, e1 = elos[i - 1], elos[i]
    t = (kyu - r0) / (r1 - r0)
    return e0 + t * (e1 - e0)


def _elo_to_weaken_fac(elo: float) -> float:
    """Invert AI_WEIGHTED_ELO: target ELO → weaken_fac to use."""
    pairs = sorted(_AI_WEIGHTED_ELO, key=lambda p: p[1])
    elos = [p[1] for p in pairs]
    facs = [p[0] for p in pairs]
    if elo <= elos[0]:
        return facs[0]
    if elo >= elos[-1]:
        return facs[-1]
    i = bisect_left(elos, elo)
    e0, e1 = elos[i - 1], elos[i]
    f0, f1 = facs[i - 1], facs[i]
    t = (elo - e0) / (e1 - e0)
    return f0 + t * (f1 - f0)


def _pick_n_for_rank(kyu: int) -> int:
    """How many top-policy moves to sample from.

    Dan strength plays the argmax; weak kyus get a wider, noisier pool.
    """
    if kyu <= 0:
        return 1
    # ~25 at 20k, ~3 at 1k. Linear fallback is fine for a demo.
    return max(3, min(30, 3 + kyu))


def rank_params(kyu: int) -> dict[str, float]:
    """Expose the computed knobs — handy for tests and logging."""
    elo = _rank_to_elo(kyu)
    return {
        "elo": elo,
        "weaken_fac": _elo_to_weaken_fac(elo),
        "pick_n": _pick_n_for_rank(kyu),
    }


# ---------------------------------------------------------------------------
# Move selection
# ---------------------------------------------------------------------------


def _history_for_katago(game: GameState) -> list[list[str]]:
    """Convert in-memory move history to KataGo (color, coord) pairs.

    Resign terminates a game, so it never appears in live play; pass is sent
    as-is. KataGo coord convention is the same letter system we already use
    (A–T, skipping I), just uppercase.
    """
    out: list[list[str]] = []
    for m in game.moves:
        color = color_label(m.color)  # type: ignore[arg-type]
        if m.kind == MoveKind.PASS:
            out.append([color, "pass"])
        elif m.kind == MoveKind.PLAY and m.point is not None:
            out.append([color, to_coord(*m.point, game.size).upper()])
    return out


def _sample_from_policy(
    policy: list[float],
    board_size: int,
    pick_n: int,
    weaken_fac: float,
    rng: random.Random,
) -> str:
    """Pick a move from KataGo's policy vector.

    KataGo returns a size*size + 1 array; the last slot is pass. Illegal
    moves are marked with negative values and are skipped.
    """
    n_points = board_size * board_size
    candidates: list[tuple[int, float]] = []
    for i, p in enumerate(policy):
        if p < 0:
            continue
        candidates.append((i, float(p)))
    if not candidates:
        return "pass"
    candidates.sort(key=lambda x: x[1], reverse=True)
    top = candidates[: max(1, pick_n)]

    # Flatten/sharpen via weaken_fac, then sample.
    exponent = 1.0 / max(0.1, weaken_fac)
    weights = [max(1e-9, p) ** exponent for _, p in top]
    idx = rng.choices(range(len(top)), weights=weights, k=1)[0]
    slot = top[idx][0]
    if slot == n_points:
        return "pass"
    row = slot // board_size
    col = slot % board_size
    return to_coord(row, col, board_size).upper()


def _rules() -> str:
    return os.environ.get("KATAGO_RULES", "chinese")


async def choose_move(
    *,
    engine: KataGoEngine,
    game: GameState,
    kyu_rank: int,
    rng: random.Random | None = None,
) -> tuple[MoveKind, tuple[int, int] | None]:
    """Return the AI's next move as (kind, point) for GameState.play().

    Fast path: 1-visit policy query. Median latency on a consumer GPU is
    ~50–200 ms even for 19×19, comfortably inside our 1 s/move budget.
    """
    if game.status != Status.ACTIVE:
        raise RuntimeError("game is not active; AI cannot move")

    params = rank_params(kyu_rank)
    rng = rng or random.Random()

    request: dict[str, Any] = {
        "rules": _rules(),
        "komi": game.komi,
        "boardXSize": game.size,
        "boardYSize": game.size,
        "initialStones": [],
        "moves": _history_for_katago(game),
        "analyzeTurns": [len(game.moves)],
        "maxVisits": 1,
        "includePolicy": True,
        "includeOwnership": False,
    }
    responses = await engine.analyze(
        request,
        expected_turns=[len(game.moves)],
        timeout=float(os.environ.get("KATAGO_AI_MOVE_TIMEOUT", "10")),
        priority=10,  # preempt slower review queries on the shared engine
    )
    resp = responses[len(game.moves)]
    policy = resp.get("policy")
    if not policy:
        log.warning("katago returned no policy; falling back to pass")
        return MoveKind.PASS, None

    coord = _sample_from_policy(
        policy=policy,
        board_size=game.size,
        pick_n=int(params["pick_n"]),
        weaken_fac=float(params["weaken_fac"]),
        rng=rng,
    )
    log.info(
        "ai move kyu=%d elo=%.0f weaken_fac=%.2f pick_n=%d -> %s",
        kyu_rank, params["elo"], params["weaken_fac"], params["pick_n"], coord,
    )
    if coord == "pass":
        return MoveKind.PASS, None
    r, c = from_coord(coord, game.size)
    return MoveKind.PLAY, (r, c)
