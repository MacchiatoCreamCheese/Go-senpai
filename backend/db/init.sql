CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle      TEXT NOT NULL UNIQUE,
    rank_estimate TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE games (
    id              UUID PRIMARY KEY,
    black_user_id   UUID REFERENCES users(id),
    white_user_id   UUID REFERENCES users(id),
    board_size      INT NOT NULL,
    ruleset         TEXT NOT NULL DEFAULT 'chinese',
    komi            FLOAT NOT NULL,
    result          TEXT,
    sgf             TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);

CREATE TABLE moves (
    id          BIGSERIAL PRIMARY KEY,
    game_id     UUID NOT NULL REFERENCES games(id),
    move_number INT NOT NULL,
    color       CHAR(1) NOT NULL,
    coord       TEXT NOT NULL,
    played_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, move_number)
);

CREATE TABLE position_analyses (
    position_hash   BYTEA PRIMARY KEY,
    board_size      INT  NOT NULL,
    visits          INT  NOT NULL,
    katago_version  TEXT NOT NULL,
    model_name      TEXT NOT NULL,
    raw_response    JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE move_features (
    game_id              UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    move_number          INT  NOT NULL,
    position_hash_before BYTEA NOT NULL,
    position_hash_after  BYTEA NOT NULL,
    points_lost          REAL,
    policy_rank          INT,
    top_move             TEXT,
    top_move_points_lost REAL,
    winrate_before       REAL,
    winrate_after        REAL,
    score_before         REAL,
    score_after          REAL,
    phase                TEXT NOT NULL CHECK (phase IN ('opening','middlegame','endgame')),
    is_blunder           BOOLEAN NOT NULL,
    local_context        JSONB,
    ownership_delta      JSONB,
    top_pv               JSONB,
    score_stdev_before   REAL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (game_id, move_number)
);
CREATE INDEX idx_move_features_game ON move_features (game_id);

CREATE TABLE go_concepts (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    tags        TEXT[] NOT NULL DEFAULT '{}',
    body_md     TEXT NOT NULL,
    body_hash   TEXT NOT NULL,
    embedding   vector(384),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_go_concepts_embedding ON go_concepts
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

CREATE TABLE reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    for_user_id     UUID NOT NULL REFERENCES users(id),
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    model           TEXT NOT NULL,
    summary_md      TEXT NOT NULL,
    moments         JSONB NOT NULL,
    cost_tokens     INT,
    UNIQUE (game_id, for_user_id)
);
CREATE INDEX idx_reviews_game ON reviews (game_id);
