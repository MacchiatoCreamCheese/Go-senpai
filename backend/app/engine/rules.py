from __future__ import annotations

from dataclasses import dataclass

from .board import Board, Color, EMPTY, opponent
from .group import find_group


class IllegalMove(Exception):
    """Raised when apply_move is given a move that violates Go rules."""


@dataclass
class PlayResult:
    board: Board
    captured: int  # opponent stones removed by this move


def apply_move(board: Board, color: Color, point: tuple[int, int], forbidden_positions: frozenset) -> PlayResult:
    """Apply a stone placement, returning a new board plus capture count.

    Raises IllegalMove on occupied point, self-capture (suicide), or positional
    superko (resulting position already in forbidden_positions).
    """
    row, col = point
    if not board.in_bounds(row, col):
        raise IllegalMove(f"point ({row},{col}) out of bounds")
    if board.get(row, col) != EMPTY:
        raise IllegalMove(f"point ({row},{col}) is occupied")

    new_board = board.copy()
    new_board.set(row, col, color)

    # Remove any opponent group adjacent to the placed stone that now has no liberties.
    captured_stones: set[tuple[int, int]] = set()
    opp = opponent(color)
    seen: set[tuple[int, int]] = set()
    for nr, nc in new_board.neighbors(row, col):
        if new_board.get(nr, nc) != opp or (nr, nc) in seen:
            continue
        stones, liberties = find_group(new_board, nr, nc)
        seen |= stones
        if not liberties:
            captured_stones |= stones

    for r, c in captured_stones:
        new_board.set(r, c, EMPTY)

    # Suicide check: the just-placed group must now have at least one liberty.
    _, own_liberties = find_group(new_board, row, col)
    if not own_liberties:
        raise IllegalMove("suicide move")

    # Positional superko: forbid repetition of any prior whole-board position.
    if new_board.snapshot() in forbidden_positions:
        raise IllegalMove("ko: position repeats a previous board state")

    return PlayResult(board=new_board, captured=len(captured_stones))
