from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from .engine.board import BLACK, WHITE, color_label
from .engine.game import GameState, Move, MoveKind, Status


ColorCode = Literal["B", "W"]
_COLOR_FROM_CODE = {"B": BLACK, "W": WHITE}


def color_from_code(code: ColorCode) -> int:
    return _COLOR_FROM_CODE[code]


class PointSchema(BaseModel):
    row: int
    col: int


class MoveSchema(BaseModel):
    color: ColorCode
    kind: Literal["play", "pass", "resign"]
    point: Optional[PointSchema] = None

    @classmethod
    def from_move(cls, move: Move) -> "MoveSchema":
        return cls(
            color=color_label(move.color),  # type: ignore[arg-type]
            kind=move.kind.value,
            point=PointSchema(row=move.point[0], col=move.point[1]) if move.point else None,
        )


class StateSchema(BaseModel):
    board: list[list[int]]
    turn: ColorCode
    captures: dict[ColorCode, int]
    moves: list[MoveSchema]
    status: Literal["active", "finished", "resigned"]
    result: Optional[str] = None

    @classmethod
    def from_game(cls, game: GameState) -> "StateSchema":
        return cls(
            board=[row[:] for row in game.board.grid],
            turn=color_label(game.turn),  # type: ignore[arg-type]
            captures={"B": game.captures[BLACK], "W": game.captures[WHITE]},
            moves=[MoveSchema.from_move(m) for m in game.moves],
            status=game.status.value,  # type: ignore[arg-type]
            result=game.result,
        )


class GameSchema(BaseModel):
    id: str
    size: int
    komi: float
    state: StateSchema


class CreateGameRequest(BaseModel):
    size: Literal[9, 13, 19] = 9
    komi: Optional[float] = Field(default=None, description="Overrides size-based default if provided.")


class MoveRequest(BaseModel):
    color: ColorCode
    kind: Literal["play", "pass", "resign"]
    point: Optional[PointSchema] = None
