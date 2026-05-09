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
    black_user_id: Optional[str] = None
    white_user_id: Optional[str] = None
    opponent_type: Literal["human", "ai"] = "human"
    ai_rank: Optional[int] = None
    training_mode: bool = False
    state: StateSchema


class CreateGameRequest(BaseModel):
    size: Literal[9, 13, 19] = 9
    komi: Optional[float] = Field(default=None, description="Overrides size-based default if provided.")
    user_id: str
    color: ColorCode = "B"
    opponent_type: Literal["human", "ai"] = "human"
    ai_rank: Optional[int] = Field(
        default=None,
        description="Kyu rank for the AI opponent; negative means dan. Required when opponent_type='ai'.",
    )
    training_mode: bool = Field(default=False, description="Enable live coaching dots during AI games.")


class MoveRequest(BaseModel):
    color: ColorCode
    kind: Literal["play", "pass", "resign"]
    point: Optional[PointSchema] = None


class CreateUserRequest(BaseModel):
    handle: str


class JoinGameRequest(BaseModel):
    user_id: str


class UserSchema(BaseModel):
    id: str
    handle: str


class GameListItem(BaseModel):
    id: str
    board_size: int
    result: Optional[str] = None
    started_at: str


class WeaknessSchema(BaseModel):
    theme: str
    severity: float
    evidence_count: int
    last_seen_at: Optional[str] = None


class ProblemSchema(BaseModel):
    id: str
    sgf: str
    solution: list[dict]
    themes: list[str]
    difficulty: int
    source: Optional[str] = None


class DrillAttemptRequest(BaseModel):
    user_id: str
    problem_id: str
    success: bool
    moves_played: list[dict] = Field(default_factory=list)
    hint_used: bool = False


class DrillAttemptSchema(BaseModel):
    id: int
    user_id: str
    problem_id: str
    attempted_at: str
    success: bool


class ConceptSchema(BaseModel):
    id: str
    title: str
    body_md: str
    tags: list[str] = Field(default_factory=list)


class ConceptListItem(BaseModel):
    id: str
    title: str
    tags: list[str] = Field(default_factory=list)
    summary: str = ""


class UserConceptItem(BaseModel):
    concept_id: str
    title: str
    times_taught: int
    last_taught_at: Optional[str] = None
    demonstrated: bool


class ProgressPoint(BaseModel):
    week: str
    value: float


class UserProgressResponse(BaseModel):
    games_per_week: list[ProgressPoint] = Field(default_factory=list)
    drills_per_week: list[ProgressPoint] = Field(default_factory=list)
    top_weakness_severity_history: list[ProgressPoint] = Field(default_factory=list)


class NextActionResponse(BaseModel):
    kind: Literal["review_game", "teach_concept", "revisit_concept", "serve_drill", "idle"]
    game_id: Optional[str] = None
    problem: Optional[ProblemSchema] = None
    concept: Optional[ConceptSchema] = None
    reason: Optional[str] = None


class ActionHistoryItem(BaseModel):
    id: int
    kind: str
    game_id: Optional[str] = None
    problem_id: Optional[str] = None
    concept_id: Optional[str] = None
    reason: Optional[str] = None
    picked_at: str
