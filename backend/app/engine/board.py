from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator

Color = int
EMPTY: Color = 0
BLACK: Color = 1
WHITE: Color = 2

VALID_SIZES = (9, 13, 19)


def opponent(color: Color) -> Color:
    if color == BLACK:
        return WHITE
    if color == WHITE:
        return BLACK
    raise ValueError(f"no opponent for color {color}")


def color_label(color: Color) -> str:
    return {BLACK: "B", WHITE: "W", EMPTY: "."}[color]


@dataclass
class Board:
    size: int
    grid: list[list[Color]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.size not in VALID_SIZES:
            raise ValueError(f"unsupported board size {self.size}")
        if not self.grid:
            self.grid = [[EMPTY] * self.size for _ in range(self.size)]

    def in_bounds(self, row: int, col: int) -> bool:
        return 0 <= row < self.size and 0 <= col < self.size

    def get(self, row: int, col: int) -> Color:
        return self.grid[row][col]

    def set(self, row: int, col: int, color: Color) -> None:
        self.grid[row][col] = color

    def neighbors(self, row: int, col: int) -> Iterator[tuple[int, int]]:
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nr, nc = row + dr, col + dc
            if self.in_bounds(nr, nc):
                yield nr, nc

    def copy(self) -> "Board":
        return Board(size=self.size, grid=[row[:] for row in self.grid])

    def snapshot(self) -> tuple[tuple[Color, ...], ...]:
        """Immutable, hashable whole-board position — used for superko tracking."""
        return tuple(tuple(row) for row in self.grid)
