from __future__ import annotations

from typing import Any

import asyncpg

pool: asyncpg.Pool | None = None


async def connect(dsn: str) -> None:
    global pool
    pool = await asyncpg.create_pool(dsn=dsn, min_size=2, max_size=10)


async def close() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


def _get_pool() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("DB pool not initialised")
    return pool


async def create_user(handle: str) -> dict[str, Any]:
    row = await _get_pool().fetchrow(
        "INSERT INTO users (handle) VALUES ($1) RETURNING id, handle, created_at",
        handle,
    )
    return dict(row)


async def get_user(user_id: str) -> dict[str, Any] | None:
    row = await _get_pool().fetchrow(
        "SELECT id, handle, rank_estimate, created_at FROM users WHERE id = $1",
        user_id,
    )
    return dict(row) if row else None


async def create_game(
    game_id: str,
    black_user_id: str,
    white_user_id: str | None,
    size: int,
    komi: float,
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO games (id, black_user_id, white_user_id, board_size, komi)
        VALUES ($1, $2, $3, $4, $5)
        """,
        game_id,
        black_user_id,
        white_user_id,
        size,
        komi,
    )


async def insert_move(
    game_id: str,
    move_number: int,
    color: str,
    coord: str,
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO moves (game_id, move_number, color, coord)
        VALUES ($1, $2, $3, $4)
        """,
        game_id,
        move_number,
        color,
        coord,
    )


async def finish_game(game_id: str, result: str, sgf: str) -> None:
    await _get_pool().execute(
        """
        UPDATE games SET result = $1, sgf = $2, ended_at = NOW()
        WHERE id = $3
        """,
        result,
        sgf,
        game_id,
    )


async def get_game_row(game_id: str) -> dict[str, Any] | None:
    row = await _get_pool().fetchrow(
        """
        SELECT id, black_user_id, white_user_id, board_size, komi,
               result, sgf, started_at, ended_at
        FROM games WHERE id = $1
        """,
        game_id,
    )
    return dict(row) if row else None


async def get_moves(game_id: str) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        "SELECT move_number, color, coord FROM moves WHERE game_id = $1 ORDER BY move_number",
        game_id,
    )
    return [dict(r) for r in rows]


async def list_user_games(user_id: str) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT id, board_size, result, started_at, ended_at
        FROM games
        WHERE black_user_id = $1 OR white_user_id = $1
        ORDER BY started_at DESC
        """,
        user_id,
    )
    return [dict(r) for r in rows]
