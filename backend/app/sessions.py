from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from fastapi import WebSocket

from .engine.game import GameState


@dataclass
class GameRecord:
    id: str  # UUID — same key used in DB and in-memory store
    game: GameState
    subscribers: set[WebSocket] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class GameStore:
    """In-memory cache of active games. Write-through to DB on every mutation."""

    def __init__(self) -> None:
        self._games: dict[str, GameRecord] = {}

    def create(self, game_id: str, game: GameState) -> GameRecord:
        record = GameRecord(id=game_id, game=game)
        self._games[game_id] = record
        return record

    def get(self, game_id: str) -> GameRecord | None:
        return self._games.get(game_id)

    def all_ids(self) -> list[str]:
        return list(self._games.keys())


store = GameStore()
