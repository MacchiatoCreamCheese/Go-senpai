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
    """Upsert by handle: returns the existing user if the handle is taken.

    Handle is the identity in this phase (no auth). Two browsers typing the
    same name get the same user row; typing a different name gets a new row.
    """
    row = await _get_pool().fetchrow(
        """
        INSERT INTO users (handle) VALUES ($1)
        ON CONFLICT (handle) DO UPDATE SET handle = EXCLUDED.handle
        RETURNING id, handle, created_at
        """,
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


async def claim_empty_seat(game_id: str, user_id: str) -> dict[str, str | None]:
    """Seat the user in whichever colour seat is empty.

    Returns {"color": "B"|"W", "black_user_id": ..., "white_user_id": ...}
    reflecting the post-update state. Raises ValueError if the user is
    already seated or both seats are filled by other users.
    """
    pool = _get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT black_user_id, white_user_id FROM games WHERE id = $1 FOR UPDATE",
                game_id,
            )
            if row is None:
                raise ValueError("game not found")
            black = row["black_user_id"]
            white = row["white_user_id"]
            uid = str(user_id)

            if (black is not None and str(black) == uid) or (
                white is not None and str(white) == uid
            ):
                raise ValueError("you are already in this game")
            if black is None:
                await conn.execute(
                    "UPDATE games SET black_user_id = $1 WHERE id = $2",
                    user_id,
                    game_id,
                )
                return {
                    "color": "B",
                    "black_user_id": uid,
                    "white_user_id": str(white) if white else None,
                }
            if white is None:
                await conn.execute(
                    "UPDATE games SET white_user_id = $1 WHERE id = $2",
                    user_id,
                    game_id,
                )
                return {
                    "color": "W",
                    "black_user_id": str(black) if black else None,
                    "white_user_id": uid,
                }
            raise ValueError("both seats are already taken")


async def swap_colors(game_id: str) -> dict[str, str | None]:
    """Swap black and white seats. Only allowed before any move is played.

    Returns {"black_user_id": ..., "white_user_id": ...} after the swap.
    """
    pool = _get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT black_user_id, white_user_id FROM games WHERE id = $1 FOR UPDATE",
                game_id,
            )
            if row is None:
                raise ValueError("game not found")
            move_count = await conn.fetchval(
                "SELECT COUNT(*) FROM moves WHERE game_id = $1", game_id
            )
            if move_count and move_count > 0:
                raise ValueError("cannot swap colours after a move has been played")
            await conn.execute(
                """
                UPDATE games
                   SET black_user_id = $1, white_user_id = $2
                 WHERE id = $3
                """,
                row["white_user_id"],
                row["black_user_id"],
                game_id,
            )
            return {
                "black_user_id": str(row["white_user_id"]) if row["white_user_id"] else None,
                "white_user_id": str(row["black_user_id"]) if row["black_user_id"] else None,
            }


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
                    phase, is_blunder, local_context, ownership_delta,
                    top_pv, score_stdev_before
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                    $17::jsonb, $18
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
                        json.dumps(r["top_pv"]) if r.get("top_pv") is not None else None,
                        r.get("score_stdev_before"),
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
               mf.top_pv, mf.score_stdev_before,
               m.color, m.coord
        FROM move_features mf
        JOIN moves m ON m.game_id = mf.game_id AND m.move_number = mf.move_number
        WHERE mf.game_id = $1
        ORDER BY mf.move_number
        """,
        game_id,
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        pv = d.get("top_pv")
        if isinstance(pv, str):
            d["top_pv"] = json.loads(pv)
        out.append(d)
    return out


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


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


async def upsert_concept(
    concept_id: str,
    title: str,
    tags: list[str],
    body_md: str,
    body_hash: str,
    embedding: list[float],
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO go_concepts (id, title, tags, body_md, body_hash, embedding, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::vector, NOW())
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            tags = EXCLUDED.tags,
            body_md = EXCLUDED.body_md,
            body_hash = EXCLUDED.body_hash,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
        """,
        concept_id,
        title,
        tags,
        body_md,
        body_hash,
        _vector_literal(embedding),
    )


async def get_concept_hashes() -> dict[str, str]:
    rows = await _get_pool().fetch("SELECT id, body_hash FROM go_concepts")
    return {r["id"]: r["body_hash"] for r in rows}


async def count_concepts() -> int:
    val = await _get_pool().fetchval("SELECT COUNT(*) FROM go_concepts")
    return int(val or 0)


async def retrieve_concepts_by_vector(
    embedding: list[float],
    limit: int = 3,
) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT id, title, tags, body_md
        FROM go_concepts
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
        """,
        _vector_literal(embedding),
        limit,
    )
    return [dict(r) for r in rows]


async def insert_review(
    game_id: str,
    for_user_id: str,
    model: str,
    summary_md: str,
    moments: list[dict[str, Any]],
    cost_tokens: int | None,
) -> dict[str, Any]:
    row = await _get_pool().fetchrow(
        """
        INSERT INTO reviews (game_id, for_user_id, model, summary_md, moments, cost_tokens)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (game_id, for_user_id) DO UPDATE SET
            model = EXCLUDED.model,
            summary_md = EXCLUDED.summary_md,
            moments = EXCLUDED.moments,
            cost_tokens = EXCLUDED.cost_tokens,
            generated_at = NOW()
        RETURNING id, game_id, for_user_id, generated_at, model, summary_md, moments, cost_tokens
        """,
        game_id,
        for_user_id,
        model,
        summary_md,
        json.dumps(moments),
        cost_tokens,
    )
    return _review_row_to_dict(row)


async def get_review(game_id: str, for_user_id: str) -> dict[str, Any] | None:
    row = await _get_pool().fetchrow(
        """
        SELECT id, game_id, for_user_id, generated_at, model, summary_md, moments, cost_tokens
        FROM reviews WHERE game_id = $1 AND for_user_id = $2
        """,
        game_id,
        for_user_id,
    )
    return _review_row_to_dict(row) if row else None


def _review_row_to_dict(row: Any) -> dict[str, Any]:
    d = dict(row)
    moments = d.get("moments")
    if isinstance(moments, str):
        d["moments"] = json.loads(moments)
    return d


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
