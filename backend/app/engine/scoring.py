from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from .board import BLACK, Board, Color, EMPTY, WHITE


@dataclass
class ScoreOutcome:
    black_stones: int
    white_stones: int
    black_territory: int
    white_territory: int
    komi: float

    @property
    def black_score(self) -> float:
        return self.black_stones + self.black_territory

    @property
    def white_score(self) -> float:
        return self.white_stones + self.white_territory + self.komi


def score_area(board: Board, komi: float) -> ScoreOutcome:
    """Chinese area scoring.

    Each player's score = their stones on the board + empty points enclosed only
    by their color. White also receives komi. This implementation does not
    attempt dead-stone detection: by convention, players capture everything
    before passing.
    """
    black_stones = 0
    white_stones = 0
    for row in board.grid:
        for cell in row:
            if cell == BLACK:
                black_stones += 1
            elif cell == WHITE:
                white_stones += 1

    black_territory, white_territory = _count_territory(board)

    return ScoreOutcome(
        black_stones=black_stones,
        white_stones=white_stones,
        black_territory=black_territory,
        white_territory=white_territory,
        komi=komi,
    )


def _count_territory(board: Board) -> tuple[int, int]:
    visited: set[tuple[int, int]] = set()
    black_terr = 0
    white_terr = 0

    for r in range(board.size):
        for c in range(board.size):
            if board.get(r, c) != EMPTY or (r, c) in visited:
                continue
            region, bordering = _flood_empty(board, r, c)
            visited |= region
            if bordering == {BLACK}:
                black_terr += len(region)
            elif bordering == {WHITE}:
                white_terr += len(region)
            # mixed or empty-bordering regions count for neither

    return black_terr, white_terr


def _flood_empty(board: Board, row: int, col: int) -> tuple[set[tuple[int, int]], set[Color]]:
    region: set[tuple[int, int]] = set()
    bordering: set[Color] = set()
    queue: deque[tuple[int, int]] = deque([(row, col)])
    region.add((row, col))
    while queue:
        r, c = queue.popleft()
        for nr, nc in board.neighbors(r, c):
            val = board.get(nr, nc)
            if val == EMPTY:
                if (nr, nc) not in region:
                    region.add((nr, nc))
                    queue.append((nr, nc))
            else:
                bordering.add(val)
    return region, bordering
