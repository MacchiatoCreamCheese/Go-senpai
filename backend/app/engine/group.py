from __future__ import annotations

from collections import deque

from .board import Board, EMPTY


def find_group(board: Board, row: int, col: int) -> tuple[frozenset[tuple[int, int]], frozenset[tuple[int, int]]]:
    """Return (stones, liberties) for the group containing (row, col).

    Assumes the point is occupied. Stones are all same-colored points connected
    orthogonally; liberties are the empty points adjacent to any stone in the group.
    """
    color = board.get(row, col)
    if color == EMPTY:
        raise ValueError(f"no group at empty point ({row},{col})")

    stones: set[tuple[int, int]] = set()
    liberties: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque([(row, col)])
    stones.add((row, col))

    while queue:
        r, c = queue.popleft()
        for nr, nc in board.neighbors(r, c):
            nval = board.get(nr, nc)
            if nval == EMPTY:
                liberties.add((nr, nc))
            elif nval == color and (nr, nc) not in stones:
                stones.add((nr, nc))
                queue.append((nr, nc))

    return frozenset(stones), frozenset(liberties)
