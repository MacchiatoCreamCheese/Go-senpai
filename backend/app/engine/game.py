from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .board import BLACK, Board, Color, VALID_SIZES, WHITE, color_label, opponent
from .rules import IllegalMove, apply_move


class MoveKind(str, Enum):
    PLAY = "play"
    PASS = "pass"
    RESIGN = "resign"


class Status(str, Enum):
    ACTIVE = "active"
    FINISHED = "finished"
    RESIGNED = "resigned"


DEFAULT_KOMI = {9: 5.5, 13: 6.5, 19: 7.5}


@dataclass
class Move:
    color: Color
    kind: MoveKind
    point: Optional[tuple[int, int]] = None


@dataclass
class GameState:
    size: int
    komi: float
    board: Board = field(init=False)
    turn: Color = BLACK
    moves: list[Move] = field(default_factory=list)
    captures: dict[Color, int] = field(default_factory=lambda: {BLACK: 0, WHITE: 0})
    status: Status = Status.ACTIVE
    result: Optional[str] = None
    _history: set = field(default_factory=set)
    _consecutive_passes: int = 0

    def __post_init__(self) -> None:
        if self.size not in VALID_SIZES:
            raise ValueError(f"unsupported size {self.size}")
        self.board = Board(size=self.size)
        self._history = {self.board.snapshot()}

    @classmethod
    def new(cls, size: int, komi: Optional[float] = None) -> "GameState":
        return cls(size=size, komi=DEFAULT_KOMI[size] if komi is None else komi)

    def play(self, color: Color, kind: MoveKind, point: Optional[tuple[int, int]] = None) -> None:
        if self.status != Status.ACTIVE:
            raise IllegalMove(f"game is {self.status.value}")
        if color != self.turn:
            raise IllegalMove(f"it is {color_label(self.turn)}'s turn, not {color_label(color)}")

        if kind == MoveKind.RESIGN:
            self.moves.append(Move(color=color, kind=kind))
            self.status = Status.RESIGNED
            self.result = f"{color_label(opponent(color))}+R"
            return

        if kind == MoveKind.PASS:
            self.moves.append(Move(color=color, kind=kind))
            self._consecutive_passes += 1
            if self._consecutive_passes >= 2:
                self._finish_by_scoring()
            else:
                self.turn = opponent(self.turn)
            return

        if kind == MoveKind.PLAY:
            if point is None:
                raise IllegalMove("play move requires a point")
            forbidden = frozenset(self._history)
            result = apply_move(self.board, color, point, forbidden)
            self.board = result.board
            self.captures[color] += result.captured
            self.moves.append(Move(color=color, kind=kind, point=point))
            self._history.add(self.board.snapshot())
            self._consecutive_passes = 0
            self.turn = opponent(self.turn)
            return

        raise IllegalMove(f"unknown move kind {kind}")

    def _finish_by_scoring(self) -> None:
        from .scoring import score_area  # local import avoids circular dep

        outcome = score_area(self.board, self.komi)
        self.status = Status.FINISHED
        margin = outcome.black_score - outcome.white_score
        if margin > 0:
            self.result = f"B+{margin:g}"
        elif margin < 0:
            self.result = f"W+{-margin:g}"
        else:
            self.result = "Draw"
