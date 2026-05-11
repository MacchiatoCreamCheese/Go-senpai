from __future__ import annotations

import json
from typing import Any

import asyncpg

pool: asyncpg.Pool | None = None


async def _ensure_runtime_schema(p: asyncpg.Pool) -> None:
    """Apply lightweight idempotent schema guards for older databases.

    Some environments reuse an existing DB where `init.sql` was not re-applied,
    so drill retry/session columns may be missing even though the code expects
    them. These ALTERs are safe to run on every startup.
    """
    async with p.acquire() as conn:
        await conn.execute(
            """
            ALTER TABLE drill_attempts
                ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES drill_sessions(id) ON DELETE SET NULL
            """
        )
        await conn.execute(
            """
            ALTER TABLE drill_attempts
                ADD COLUMN IF NOT EXISTS is_retry BOOLEAN NOT NULL DEFAULT FALSE
            """
        )
        await conn.execute(
            """
            ALTER TABLE drill_attempts
                ADD COLUMN IF NOT EXISTS retry_of_attempt_id BIGINT REFERENCES drill_attempts(id) ON DELETE SET NULL
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_drill_attempts_session
            ON drill_attempts (session_id)
            """
        )
        await conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_drill_attempts_session_problem
            ON drill_attempts (session_id, problem_id)
            """
        )


async def connect(dsn: str) -> None:
    global pool
    use_ssl = "localhost" not in dsn and "127.0.0.1" not in dsn
    pool = await asyncpg.create_pool(
        dsn=dsn, min_size=2, max_size=10,
        ssl="require" if use_ssl else None,
    )
    await _ensure_runtime_schema(pool)


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
        "SELECT id, handle, email, rank_estimate, created_at FROM users WHERE id = $1",
        user_id,
    )
    return dict(row) if row else None


async def ensure_legacy_user(user_id: str) -> dict[str, Any]:
    """Upsert a minimal user row for a UUID that lives in the client's
    localStorage but is absent from this DB instance (stale after a DB reset
    or a switch from Supabase → legacy mode).  The generated handle can be
    customised later via the Profile page."""
    pool = _get_pool()
    # Use 16 hex chars so the temp handle is effectively unique per UUID.
    uid_short = str(user_id).replace("-", "")[:16]
    temp_handle = f"user-{uid_short}"
    row = await pool.fetchrow(
        """
        INSERT INTO users (id, handle, created_via)
        VALUES ($1, $2, 'local')
        ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
        RETURNING id, handle, email, created_at
        """,
        user_id,
        temp_handle,
    )
    return dict(row)


def _default_auth_handle(supabase_user_id: str, email: str | None) -> str:
    """Stable default ``users.handle`` for new Supabase sign-ups.

    ``handle`` is UNIQUE in the DB. Using only the email local-part caused
    collisions (e.g. ``john@gmail.com`` vs ``john@yahoo.com``). We always
    append a slice of the auth user id so the handle is unique per ``sub``.
    Users can still rename via ``update_user_handle``.
    """
    uid = str(supabase_user_id).replace("-", "")[:12]
    if email and "@" in email:
        local = email.split("@", 1)[0]
        slug = "".join(c for c in local if c.isalnum() or c in "_-")[:12]
        if slug:
            return f"{slug}-{uid}"[:32]
    return f"user-{uid}"[:32]


async def get_or_create_user_from_auth(
    supabase_user_id: str, email: str | None
) -> dict[str, Any]:
    """Mirror a Supabase user into our local ``users`` table.

    The Supabase ``auth.users.id`` becomes our ``users.id`` so all FK columns
    (games, drill_attempts, etc.) join cleanly with the JWT's ``sub`` claim.

    Handle defaults to a readable prefix plus id entropy; users can change it
    via ``update_user_handle``.
    """
    pool = _get_pool()
    handle_default = _default_auth_handle(supabase_user_id, email)
    row = await pool.fetchrow(
        """
        INSERT INTO users (id, handle, email, created_via)
        VALUES ($1, $2, $3, 'supabase')
        ON CONFLICT (id) DO UPDATE
          SET email = COALESCE(EXCLUDED.email, users.email)
        RETURNING id, handle, email, rank_estimate, created_at
        """,
        supabase_user_id,
        handle_default,
        email,
    )
    return dict(row)


async def update_user_handle(user_id: str, handle: str) -> dict[str, Any] | None:
    row = await _get_pool().fetchrow(
        """
        UPDATE users SET handle = $2 WHERE id = $1
        RETURNING id, handle, email, rank_estimate, created_at
        """,
        user_id,
        handle,
    )
    return dict(row) if row else None


async def create_game(
    game_id: str,
    black_user_id: str,
    white_user_id: str | None,
    size: int,
    komi: float,
    opponent_type: str = "human",
    ai_rank: int | None = None,
    training_mode: bool = False,
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO games (id, black_user_id, white_user_id, board_size, komi,
                           opponent_type, ai_rank, training_mode)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        game_id,
        black_user_id,
        white_user_id,
        size,
        komi,
        opponent_type,
        ai_rank,
        training_mode,
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
               result, sgf, opponent_type, ai_rank, training_mode, started_at, ended_at
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


async def upsert_move_feature(
    game_id: str,
    f: Any,  # MoveFeatures dataclass; typed as Any to avoid circular import
    position_hash_before: bytes,
    position_hash_after: bytes,
) -> None:
    """Insert or update a single move_features row (used for live analysis)."""
    await _get_pool().execute(
        """
        INSERT INTO move_features (
            game_id, move_number, position_hash_before, position_hash_after,
            points_lost, policy_rank, top_move, top_move_points_lost,
            winrate_before, winrate_after, score_before, score_after,
            phase, is_blunder, local_context, ownership_delta,
            top_pv, score_stdev_before
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            NULL, NULL, $15::jsonb, $16
        )
        ON CONFLICT (game_id, move_number) DO UPDATE SET
            position_hash_before = EXCLUDED.position_hash_before,
            position_hash_after  = EXCLUDED.position_hash_after,
            points_lost          = EXCLUDED.points_lost,
            policy_rank          = EXCLUDED.policy_rank,
            top_move             = EXCLUDED.top_move,
            top_move_points_lost = EXCLUDED.top_move_points_lost,
            winrate_before       = EXCLUDED.winrate_before,
            winrate_after        = EXCLUDED.winrate_after,
            score_before         = EXCLUDED.score_before,
            score_after          = EXCLUDED.score_after,
            phase                = EXCLUDED.phase,
            is_blunder           = EXCLUDED.is_blunder,
            top_pv               = EXCLUDED.top_pv,
            score_stdev_before   = EXCLUDED.score_stdev_before
        """,
        game_id,
        f.move_number,
        position_hash_before,
        position_hash_after,
        f.points_lost,
        f.policy_rank,
        f.top_move,
        f.top_move_points_lost,
        f.winrate_before,
        f.winrate_after,
        f.score_before,
        f.score_after,
        f.phase,
        f.is_blunder,
        json.dumps(f.top_pv) if f.top_pv is not None else None,
        f.score_stdev_before,
    )


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


async def get_move_ownership(game_id: str, move_number: int) -> list[float] | None:
    """Return the ownership array for the board position after move_number."""
    row = await _get_pool().fetchrow(
        """
        SELECT pa.raw_response
        FROM move_features mf
        JOIN position_analyses pa ON pa.position_hash = mf.position_hash_after
        WHERE mf.game_id = $1 AND mf.move_number = $2
        """,
        game_id,
        move_number,
    )
    if not row:
        return None
    raw = row["raw_response"]
    if isinstance(raw, str):
        raw = json.loads(raw)
    return raw.get("ownership")


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


async def mark_game_processed_for_weakness(user_id: str, game_id: str) -> bool:
    """Record that we've extracted weakness evidence for (user, game).

    Returns True if this is the first time; False if the pair was already
    processed (caller should skip to avoid double-counting on /analyze re-runs).
    """
    row = await _get_pool().fetchrow(
        """
        INSERT INTO user_weakness_games_processed (user_id, game_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, game_id) DO NOTHING
        RETURNING game_id
        """,
        user_id,
        game_id,
    )
    return row is not None


async def upsert_user_weakness(
    user_id: str,
    theme: str,
    score: float,
    alpha: float,
) -> None:
    """EMA-update severity for (user, theme). Inserts row if missing."""
    await _get_pool().execute(
        """
        INSERT INTO user_weaknesses (user_id, theme, severity, evidence_count, last_seen_at, last_updated_at)
        VALUES ($1, $2, $3::real, 1, CASE WHEN $3::real > 0 THEN NOW() ELSE NULL END, NOW())
        ON CONFLICT (user_id, theme) DO UPDATE SET
            severity = $4::real * $3::real + (1 - $4::real) * user_weaknesses.severity,
            evidence_count = user_weaknesses.evidence_count + 1,
            last_seen_at = CASE WHEN $3::real > 0 THEN NOW() ELSE user_weaknesses.last_seen_at END,
            last_updated_at = NOW()
        """,
        user_id,
        theme,
        score,
        alpha,
    )


async def list_user_weaknesses(user_id: str) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT theme, severity, evidence_count, last_seen_at
        FROM user_weaknesses
        WHERE user_id = $1
        ORDER BY severity DESC, theme ASC
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def upsert_problem(
    problem_id: str,
    sgf: str,
    solution: list[dict[str, Any]],
    themes: list[str],
    difficulty: int,
    source: str | None,
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO problems (id, sgf, solution, themes, difficulty, source)
        VALUES ($1, $2, $3::jsonb, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
            sgf = EXCLUDED.sgf,
            solution = EXCLUDED.solution,
            themes = EXCLUDED.themes,
            difficulty = EXCLUDED.difficulty,
            source = EXCLUDED.source
        """,
        problem_id,
        sgf,
        json.dumps(solution),
        themes,
        difficulty,
        source,
    )


async def get_problem(problem_id: str) -> dict[str, Any] | None:
    row = await _get_pool().fetchrow(
        "SELECT id, sgf, solution, themes, difficulty, source FROM problems WHERE id = $1",
        problem_id,
    )
    if row is None:
        return None
    out = dict(row)
    if isinstance(out.get("solution"), str):
        out["solution"] = json.loads(out["solution"])
    return out


async def list_candidate_problems(
    themes: list[str],
    limit: int = 50,
) -> list[dict[str, Any]]:
    """If themes is non-empty, pick problems tagged with any of those themes.
    Otherwise return a random sample across all problems."""
    if themes:
        rows = await _get_pool().fetch(
            """
            SELECT id, sgf, solution, themes, difficulty, source
            FROM problems
            WHERE themes && $1::text[]
            ORDER BY RANDOM()
            LIMIT $2
            """,
            themes,
            limit,
        )
    else:
        rows = await _get_pool().fetch(
            """
            SELECT id, sgf, solution, themes, difficulty, source
            FROM problems
            ORDER BY RANDOM()
            LIMIT $1
            """,
            limit,
        )
    out = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("solution"), str):
            d["solution"] = json.loads(d["solution"])
        out.append(d)
    return out


async def insert_action_history(
    user_id: str,
    kind: str,
    game_id: str | None = None,
    problem_id: str | None = None,
    concept_id: str | None = None,
    reason: str | None = None,
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO action_history (user_id, kind, game_id, problem_id, concept_id, reason)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        user_id,
        kind,
        game_id,
        problem_id,
        concept_id,
        reason,
    )


async def list_action_history(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    try:
        rows = await _get_pool().fetch(
            """
            SELECT id, kind, game_id, problem_id, concept_id, reason, picked_at
            FROM action_history
            WHERE user_id = $1
            ORDER BY picked_at DESC
            LIMIT $2
            """,
            user_id,
            limit,
        )
        return [dict(r) for r in rows]
    except RuntimeError:
        # DB pool not initialised (e.g. in unit tests); return empty history.
        return []


async def record_drill_attempt(
    user_id: str,
    problem_id: str,
    success: bool,
    moves_played: list[dict[str, Any]],
    hint_used: bool,
    session_id: str | None = None,
    is_retry: bool = False,
    retry_of_attempt_id: int | None = None,
) -> dict[str, Any]:
    if is_retry and retry_of_attempt_id is None:
        raise ValueError("retry_of_attempt_id required when is_retry is true")
    if not is_retry and retry_of_attempt_id is not None:
        raise ValueError("retry_of_attempt_id must be null when is_retry is false")

    pool = _get_pool()
    if session_id:
        session = await pool.fetchrow(
            "SELECT user_id, status FROM drill_sessions WHERE id = $1",
            session_id,
        )
        if not session:
            raise ValueError("session not found")
        if str(session["user_id"]) != str(user_id):
            raise ValueError("session does not belong to user")
        if str(session["status"]) != "active":
            raise ValueError("session is not active")

    if retry_of_attempt_id is not None:
        base_attempt = await pool.fetchrow(
            """
            SELECT user_id, problem_id, session_id
            FROM drill_attempts
            WHERE id = $1
            """,
            retry_of_attempt_id,
        )
        if not base_attempt:
            raise ValueError("retry_of_attempt_id not found")
        if str(base_attempt["user_id"]) != str(user_id):
            raise ValueError("retry attempt must belong to the same user")
        if str(base_attempt["problem_id"]) != str(problem_id):
            raise ValueError("retry attempt must target the same problem")
        base_session_id = str(base_attempt["session_id"]) if base_attempt["session_id"] else None
        if base_session_id != session_id:
            raise ValueError("retry attempt must stay in the same session")

    row = await pool.fetchrow(
        """
        INSERT INTO drill_attempts (user_id, problem_id, success, moves_played, hint_used, session_id, is_retry, retry_of_attempt_id)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
        RETURNING id, user_id, problem_id, attempted_at, success, session_id, is_retry, retry_of_attempt_id
        """,
        user_id,
        problem_id,
        success,
        json.dumps(moves_played),
        hint_used,
        session_id,
        is_retry,
        retry_of_attempt_id,
    )
    if success:
        await _mark_demonstrated_for_problem(user_id, problem_id)
    return dict(row)


async def delete_drill_session(session_id: str, user_id: str) -> bool:
    """Delete a drill session.

    If user_id is non-empty, deletion is ownership-scoped.
    Legacy mode may pass an empty user_id and delete by id only.
    """
    pool = _get_pool()
    if user_id:
        row = await pool.fetchrow(
            """
            DELETE FROM drill_sessions
            WHERE id = $1 AND user_id = $2
            RETURNING id
            """,
            session_id,
            user_id,
        )
        return row is not None

    row = await pool.fetchrow(
        "DELETE FROM drill_sessions WHERE id = $1 RETURNING id",
        session_id,
    )
    return row is not None


async def _mark_demonstrated_for_problem(user_id: str, problem_id: str) -> None:
    """On a successful drill, mark any concept the drill's themes cover as
    demonstrated. Keeps the signal evidence-based: the user didn't just see
    the concept, they solved a problem with a matching theme.
    """
    # Deferred import: orchestrator imports from ..services which imports db;
    # module-level import would create a cycle.
    from .services.drills.selector import WEAKNESS_TO_PROBLEM_THEMES
    from .services.orchestrator.planner import WEAKNESS_TO_CONCEPT_ID

    problem = await get_problem(problem_id)
    if not problem:
        return
    themes = set(problem.get("themes") or [])
    if not themes:
        return
    concept_ids: set[str] = set()
    for weakness_theme, problem_themes in WEAKNESS_TO_PROBLEM_THEMES.items():
        if themes.intersection(problem_themes):
            concept_id = WEAKNESS_TO_CONCEPT_ID.get(weakness_theme)
            if concept_id:
                concept_ids.add(concept_id)
    if concept_ids:
        await mark_concepts_demonstrated(user_id, list(concept_ids))


async def get_concept(concept_id: str) -> dict[str, Any] | None:
    row = await _get_pool().fetchrow(
        "SELECT id, title, tags, body_md FROM go_concepts WHERE id = $1",
        concept_id,
    )
    return dict(row) if row else None


async def list_unreviewed_games_for_user(
    user_id: str,
    limit: int = 5,
) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT g.id, g.started_at, g.ended_at, g.result
        FROM games g
        LEFT JOIN reviews r
               ON r.game_id = g.id AND r.for_user_id = $1
        WHERE g.ended_at IS NOT NULL
          AND (g.black_user_id = $1 OR g.white_user_id = $1)
          AND r.id IS NULL
        ORDER BY g.ended_at DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    return [dict(r) for r in rows]


async def list_concepts_seen(user_id: str) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT concept_id, times_taught, last_taught_at,
               user_demonstrated, demonstrated_at
        FROM user_concepts_seen
        WHERE user_id = $1
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def record_concept_taught(user_id: str, concept_id: str) -> None:
    await _get_pool().execute(
        """
        INSERT INTO user_concepts_seen (user_id, concept_id, times_taught, last_taught_at)
        VALUES ($1, $2, 1, NOW())
        ON CONFLICT (user_id, concept_id) DO UPDATE SET
            times_taught = user_concepts_seen.times_taught + 1,
            last_taught_at = NOW()
        """,
        user_id,
        concept_id,
    )


async def mark_concepts_demonstrated(
    user_id: str,
    concept_ids: list[str],
) -> None:
    if not concept_ids:
        return
    await _get_pool().execute(
        """
        UPDATE user_concepts_seen
           SET user_demonstrated = TRUE,
               demonstrated_at = NOW()
         WHERE user_id = $1
           AND concept_id = ANY($2::text[])
        """,
        user_id,
        concept_ids,
    )


async def recent_problem_ids(user_id: str, limit: int = 5) -> list[str]:
    rows = await _get_pool().fetch(
        """
        SELECT problem_id FROM drill_attempts
        WHERE user_id = $1
        ORDER BY attempted_at DESC
        LIMIT $2
        """,
        user_id,
        limit,
    )
    return [r["problem_id"] for r in rows]


async def list_concepts() -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        "SELECT id, title, tags, body_md FROM go_concepts ORDER BY title"
    )
    return [dict(r) for r in rows]


async def list_user_concept_progress(user_id: str) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT s.concept_id, c.title, s.times_taught, s.last_taught_at,
               s.user_demonstrated AS demonstrated
        FROM user_concepts_seen s
        JOIN go_concepts c ON c.id = s.concept_id
        WHERE s.user_id = $1
        ORDER BY s.last_taught_at DESC NULLS LAST
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def user_progress_series(user_id: str, weeks: int = 7) -> dict[str, list[dict[str, Any]]]:
    """Return per-week counts for the last `weeks` weeks. Each series is a list
    of {week: ISO date (week start, Monday), value: number}.
    """
    pool = _get_pool()
    games_rows = await pool.fetch(
        """
        SELECT date_trunc('week', started_at)::date AS week, COUNT(*) AS n
        FROM games
        WHERE (black_user_id = $1 OR white_user_id = $1)
          AND started_at >= NOW() - ($2::int || ' weeks')::interval
        GROUP BY 1 ORDER BY 1
        """,
        user_id, weeks,
    )
    drills_rows = await pool.fetch(
        """
        SELECT date_trunc('week', attempted_at)::date AS week, COUNT(*) AS n
        FROM drill_attempts
        WHERE user_id = $1
          AND NOT COALESCE(is_retry, FALSE)
          AND attempted_at >= NOW() - ($2::int || ' weeks')::interval
        GROUP BY 1 ORDER BY 1
        """,
        user_id, weeks,
    )
    sev_rows = await pool.fetch(
        """
        SELECT date_trunc('week', last_updated_at)::date AS week,
               MAX(severity) AS sev
        FROM user_weaknesses
        WHERE user_id = $1
          AND last_updated_at >= NOW() - ($2::int || ' weeks')::interval
        GROUP BY 1 ORDER BY 1
        """,
        user_id, weeks,
    )
    return {
        "games_per_week": [{"week": r["week"].isoformat(), "value": int(r["n"])} for r in games_rows],
        "drills_per_week": [{"week": r["week"].isoformat(), "value": int(r["n"])} for r in drills_rows],
        "top_weakness_severity_history": [
            {"week": r["week"].isoformat(), "value": float(r["sev"])} for r in sev_rows
        ],
    }


async def get_move_note(
    game_id: str, move_number: int, for_user_id: str
) -> dict[str, Any] | None:
    row = await _get_pool().fetchrow(
        """
        SELECT tier, body_md, concept_ids, model, generated_at
        FROM move_notes
        WHERE game_id=$1 AND move_number=$2 AND for_user_id=$3
        """,
        game_id,
        move_number,
        for_user_id,
    )
    return dict(row) if row else None


async def insert_move_note(
    game_id: str,
    move_number: int,
    for_user_id: str,
    tier: str,
    body_md: str,
    concept_ids: list[str],
    model: str,
) -> dict[str, Any]:
    row = await _get_pool().fetchrow(
        """
        INSERT INTO move_notes (game_id, move_number, for_user_id, tier, body_md, concept_ids, model)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (game_id, move_number, for_user_id) DO UPDATE
          SET body_md=EXCLUDED.body_md, concept_ids=EXCLUDED.concept_ids,
              model=EXCLUDED.model, generated_at=NOW()
        RETURNING tier, body_md, concept_ids, model, generated_at
        """,
        game_id,
        move_number,
        for_user_id,
        tier,
        body_md,
        concept_ids,
        model,
    )
    return dict(row)  # type: ignore[arg-type]


async def create_coach_session(game_id: str, user_id: str) -> str:
    row = await _get_pool().fetchrow(
        "INSERT INTO coach_sessions (game_id, user_id) VALUES ($1, $2) RETURNING id",
        game_id,
        user_id,
    )
    return str(row["id"])


async def get_coach_turns(session_id: str, limit: int = 6) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT role, invocation_mode, user_input, assistant_output_md
        FROM coach_turns
        WHERE session_id = $1
        ORDER BY turn_number DESC
        LIMIT $2
        """,
        session_id,
        limit,
    )
    return [dict(r) for r in reversed(rows)]  # chronological order


async def insert_coach_turn(
    session_id: str,
    turn_number: int,
    role: str,
    mode: str,
    user_input: str | None,
    assistant_output_md: str | None,
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO coach_turns
            (session_id, turn_number, role, invocation_mode, user_input, assistant_output_md)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        session_id,
        turn_number,
        role,
        mode,
        user_input,
        assistant_output_md,
    )


async def truncate_moves(game_id: str, from_move_number: int) -> None:
    """Delete moves >= from_move_number and their analysis rows."""
    pool = _get_pool()
    await pool.execute(
        "DELETE FROM move_features WHERE game_id=$1 AND move_number>=$2",
        game_id,
        from_move_number,
    )
    await pool.execute(
        "DELETE FROM player_move_notes WHERE game_id=$1 AND move_number>=$2",
        game_id,
        from_move_number,
    )
    await pool.execute(
        "DELETE FROM moves WHERE game_id=$1 AND move_number>=$2",
        game_id,
        from_move_number,
    )


async def upsert_player_move_note(
    game_id: str, move_number: int, user_id: str, body: str
) -> None:
    await _get_pool().execute(
        """
        INSERT INTO player_move_notes (game_id, move_number, user_id, body)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (game_id, move_number, user_id) DO UPDATE
          SET body = EXCLUDED.body, updated_at = NOW()
        """,
        game_id,
        move_number,
        user_id,
        body,
    )


async def get_player_move_notes(game_id: str, user_id: str) -> dict[int, str]:
    rows = await _get_pool().fetch(
        "SELECT move_number, body FROM player_move_notes WHERE game_id=$1 AND user_id=$2",
        game_id,
        user_id,
    )
    return {r["move_number"]: r["body"] for r in rows}


async def list_user_games(user_id: str) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT
            g.id,
            g.board_size,
            g.result,
            g.started_at,
            g.ended_at,
            CASE
                WHEN g.black_user_id = $1::uuid THEN 'B'
                WHEN g.white_user_id = $1::uuid THEN 'W'
            END AS player_color,
            g.opponent_type,
            CASE
                WHEN g.opponent_type = 'ai'         THEN 'Sensei AI'
                WHEN g.black_user_id = $1::uuid     THEN opp_w.handle
                WHEN g.white_user_id = $1::uuid     THEN opp_b.handle
            END AS opponent_handle
        FROM games g
        LEFT JOIN users opp_b
               ON opp_b.id = g.black_user_id AND g.white_user_id = $1::uuid
        LEFT JOIN users opp_w
               ON opp_w.id = g.white_user_id AND g.black_user_id = $1::uuid
        WHERE g.black_user_id = $1::uuid OR g.white_user_id = $1::uuid
        ORDER BY g.started_at DESC
        """,
        user_id,
    )
    return [dict(r) for r in rows]


async def get_drill_stats(user_id: str) -> dict[str, Any]:
    row = await _get_pool().fetchrow(
        """
        SELECT
            COUNT(*)                             AS total_attempts,
            COUNT(*) FILTER (WHERE success)      AS correct
        FROM drill_attempts
        WHERE user_id = $1 AND NOT COALESCE(is_retry, FALSE)
        """,
        user_id,
    )
    return dict(row) if row else {"total_attempts": 0, "correct": 0}


async def create_drill_session(user_id: str, target_problem_count: int = 5) -> dict[str, Any]:
    if target_problem_count < 1:
        raise ValueError("target_problem_count must be >= 1")

    pool = _get_pool()
    existing = await pool.fetchrow(
        """
        SELECT s.*,
               COUNT(a.id) FILTER (WHERE NOT COALESCE(a.is_retry, FALSE))
                                                    AS attempt_count,
               COUNT(a.id) FILTER (
                   WHERE a.success AND NOT COALESCE(a.is_retry, FALSE)
               )                                    AS correct_count
        FROM drill_sessions s
        LEFT JOIN drill_attempts a ON a.session_id = s.id
        WHERE s.user_id = $1 AND s.status = 'active'
        GROUP BY s.id
        """,
        user_id,
    )
    if existing:
        raise ValueError("You already have an active drill session. Finish or delete it before starting a new one.")

    try:
        row = await pool.fetchrow(
            "INSERT INTO drill_sessions (user_id, target_problem_count) VALUES ($1, $2) RETURNING *",
            user_id,
            target_problem_count,
        )
    except asyncpg.UniqueViolationError:
        # Another request created an active session concurrently.
        row = await pool.fetchrow(
            """
            SELECT s.*,
                   COUNT(a.id) FILTER (WHERE NOT COALESCE(a.is_retry, FALSE))                          AS attempt_count,
                   COUNT(a.id) FILTER (WHERE a.success AND NOT COALESCE(a.is_retry, FALSE))            AS correct_count
            FROM drill_sessions s
            LEFT JOIN drill_attempts a ON a.session_id = s.id
            WHERE s.user_id = $1 AND s.status = 'active'
            GROUP BY s.id
            """,
            user_id,
        )
        if row is None:
            raise

    d = dict(row)
    d.setdefault("attempt_count", 0)
    d.setdefault("correct_count", 0)
    return d


async def finish_drill_session(session_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    pool = _get_pool()
    if user_id:
        row = await pool.fetchrow(
            """
            UPDATE drill_sessions
            SET status = 'finished', finished_at = NOW()
            WHERE id = $1 AND status = 'active' AND user_id = $2
            RETURNING *
            """,
            session_id,
            user_id,
        )
    else:
        row = await pool.fetchrow(
            """
            UPDATE drill_sessions
            SET status = 'finished', finished_at = NOW()
            WHERE id = $1 AND status = 'active'
            RETURNING *
            """,
            session_id,
        )
    return dict(row) if row else None


async def get_drill_session(session_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    pool = _get_pool()
    if user_id:
        row = await pool.fetchrow(
            """
            SELECT s.*,
                   COUNT(a.id) FILTER (WHERE NOT COALESCE(a.is_retry, FALSE))
                                                            AS attempt_count,
                   COUNT(a.id) FILTER (
                       WHERE a.success AND NOT COALESCE(a.is_retry, FALSE)
                   )                                        AS correct_count
            FROM drill_sessions s
            LEFT JOIN drill_attempts a ON a.session_id = s.id
            WHERE s.id = $1 AND s.user_id = $2
            GROUP BY s.id
            """,
            session_id,
            user_id,
        )
    else:
        row = await pool.fetchrow(
            """
            SELECT s.*,
                   COUNT(a.id) FILTER (WHERE NOT COALESCE(a.is_retry, FALSE))
                                                            AS attempt_count,
                   COUNT(a.id) FILTER (
                       WHERE a.success AND NOT COALESCE(a.is_retry, FALSE)
                   )                                        AS correct_count
            FROM drill_sessions s
            LEFT JOIN drill_attempts a ON a.session_id = s.id
            WHERE s.id = $1
            GROUP BY s.id
            """,
            session_id,
        )
    return dict(row) if row else None


async def list_drill_sessions(
    user_id: str, limit: int = 20, offset: int = 0
) -> list[dict[str, Any]]:
    rows = await _get_pool().fetch(
        """
        SELECT s.*,
               COUNT(a.id) FILTER (WHERE NOT COALESCE(a.is_retry, FALSE))
                                                        AS attempt_count,
               COUNT(a.id) FILTER (
                   WHERE a.success AND NOT COALESCE(a.is_retry, FALSE)
               )                                        AS correct_count
        FROM drill_sessions s
        LEFT JOIN drill_attempts a ON a.session_id = s.id
        WHERE s.user_id = $1
        GROUP BY s.id
        ORDER BY s.started_at DESC
        LIMIT $2 OFFSET $3
        """,
        user_id,
        limit,
        offset,
    )
    return [dict(r) for r in rows]


async def get_drill_analytics(user_id: str) -> dict[str, Any]:
    row = await _get_pool().fetchrow(
        """
        WITH stats AS (
            SELECT
                COUNT(*)                                                                    AS total_attempts,
                COUNT(*) FILTER (WHERE success)                                             AS correct,
                COUNT(*) FILTER (WHERE attempted_at >= NOW() - INTERVAL '7 days')          AS this_week_attempts,
                COUNT(*) FILTER (WHERE success AND attempted_at >= NOW() - INTERVAL '7 days')
                                                                                            AS this_week_correct,
                COUNT(*) FILTER (WHERE attempted_at >= NOW() - INTERVAL '14 days'
                                   AND attempted_at <  NOW() - INTERVAL '7 days')          AS last_week_attempts,
                COUNT(*) FILTER (WHERE success
                                   AND attempted_at >= NOW() - INTERVAL '14 days'
                                   AND attempted_at <  NOW() - INTERVAL '7 days')          AS last_week_correct
            FROM drill_attempts
            WHERE user_id = $1 AND NOT COALESCE(is_retry, FALSE)
        ),
        session_count AS (
            SELECT COUNT(*) AS sessions FROM drill_sessions WHERE user_id = $1
        )
        SELECT s.*, sc.sessions
        FROM stats s, session_count sc
        """,
        user_id,
    )
    base = dict(row) if row else {
        "total_attempts": 0, "correct": 0,
        "this_week_attempts": 0, "this_week_correct": 0,
        "last_week_attempts": 0, "last_week_correct": 0,
        "sessions": 0,
    }

    theme_rows = await _get_pool().fetch(
        """
        SELECT
            unnest(p.themes)                                 AS theme,
            COUNT(a.id)                                      AS attempts,
            COUNT(a.id) FILTER (WHERE a.success)             AS correct
        FROM drill_attempts a
        JOIN problems p ON p.id = a.problem_id
        WHERE a.user_id = $1 AND NOT COALESCE(a.is_retry, FALSE)
        GROUP BY 1
        ORDER BY attempts DESC
        LIMIT 20
        """,
        user_id,
    )
    base["theme_rows"] = [dict(r) for r in theme_rows]
    return base
