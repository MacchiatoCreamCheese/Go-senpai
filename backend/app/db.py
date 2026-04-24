from __future__ import annotations

import json
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


async def insert_move_features(
    game_id: str,
    rows: list[dict[str, Any]],
) -> None:
    """Replace move_features rows for a game in one transaction."""
    pool = _get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("DELETE FROM move_features WHERE game_id = $1", game_id)
            await conn.executemany(
                """
                INSERT INTO move_features (
                    game_id, move_number, position_hash_before, position_hash_after,
                    points_lost, policy_rank, top_move, top_move_points_lost,
                    winrate_before, winrate_after, score_before, score_after,
                    phase, is_blunder, local_context, ownership_delta
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
                )
                """,
                [
                    (
                        game_id,
                        r["move_number"],
                        r["position_hash_before"],
                        r["position_hash_after"],
                        r["points_lost"],
                        r["policy_rank"],
                        r["top_move"],
                        r["top_move_points_lost"],
                        r["winrate_before"],
                        r["winrate_after"],
                        r["score_before"],
                        r["score_after"],
                        r["phase"],
                        r["is_blunder"],
                        r["local_context"],
                        r["ownership_delta"],
                    )
                    for r in rows
                ],
            )


async def get_move_features(game_id: str) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT mf.move_number, mf.points_lost, mf.policy_rank, mf.top_move,
               mf.top_move_points_lost, mf.winrate_before, mf.winrate_after,
               mf.score_before, mf.score_after, mf.phase, mf.is_blunder,
               m.color, m.coord
        FROM move_features mf
        JOIN moves m ON m.game_id = mf.game_id AND m.move_number = mf.move_number
        WHERE mf.game_id = $1
        ORDER BY mf.move_number
        """,
        game_id,
    )
    return [dict(r) for r in rows]


async def get_cached_analyses(hashes: list[bytes]) -> dict[bytes, dict[str, Any]]:
    """Return {position_hash: raw_response} for any hashes already analyzed."""
    if not hashes:
        return {}
    rows = await _get_pool().fetch(
        "SELECT position_hash, raw_response FROM position_analyses WHERE position_hash = ANY($1::bytea[])",
        hashes,
    )
    out: dict[bytes, dict[str, Any]] = {}
    for r in rows:
        raw = r["raw_response"]
        if isinstance(raw, str):
            raw = json.loads(raw)
        out[bytes(r["position_hash"])] = raw
    return out


async def put_cached_analyses(
    entries: list[dict[str, Any]],
) -> None:
    """Insert (or ignore on conflict) a batch of position_analyses rows."""
    if not entries:
        return
    await _get_pool().executemany(
        """
        INSERT INTO position_analyses
            (position_hash, board_size, visits, katago_version, model_name, raw_response)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (position_hash) DO NOTHING
        """,
        [
            (
                e["position_hash"],
                e["board_size"],
                e["visits"],
                e["katago_version"],
                e["model_name"],
                json.dumps(e["raw_response"]),
            )
            for e in entries
        ],
    )


async def count_move_features(game_id: str) -> int:
    val = await _get_pool().fetchval(
        "SELECT COUNT(*) FROM move_features WHERE game_id = $1",
        game_id,
    )
    return int(val or 0)


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
