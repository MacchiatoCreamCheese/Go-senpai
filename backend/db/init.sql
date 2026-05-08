CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle      TEXT NOT NULL UNIQUE,
    email       TEXT UNIQUE,
    created_via TEXT NOT NULL DEFAULT 'local',
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
    opponent_type   TEXT NOT NULL DEFAULT 'human' CHECK (opponent_type IN ('human','ai')),
    ai_rank         INT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ
);

-- Reserved user row representing the KataGo AI opponent. Fixed UUID so the
-- backend can reference it without a lookup round-trip.
INSERT INTO users (id, handle) VALUES
    ('00000000-0000-0000-0000-0000000000a1', 'sensei-ai')
ON CONFLICT (handle) DO NOTHING;

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

CREATE TABLE user_weaknesses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme             TEXT NOT NULL,
    severity          REAL NOT NULL DEFAULT 0.0,
    evidence_count    INT  NOT NULL DEFAULT 0,
    last_seen_at      TIMESTAMPTZ,
    last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, theme)
);
CREATE INDEX idx_user_weaknesses_user ON user_weaknesses (user_id);

CREATE TABLE user_weakness_games_processed (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id       UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, game_id)
);

CREATE TABLE problems (
    id          TEXT PRIMARY KEY,
    sgf         TEXT NOT NULL,
    solution    JSONB NOT NULL,
    themes      TEXT[] NOT NULL DEFAULT '{}',
    difficulty  INT NOT NULL,
    source      TEXT
);
CREATE INDEX idx_problems_themes ON problems USING GIN (themes);
CREATE INDEX idx_problems_difficulty ON problems (difficulty);

CREATE TABLE drill_attempts (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id    TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success       BOOLEAN NOT NULL,
    moves_played  JSONB NOT NULL DEFAULT '[]'::jsonb,
    hint_used     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_drill_attempts_user_time ON drill_attempts (user_id, attempted_at DESC);

CREATE TABLE user_concepts_seen (
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id         TEXT NOT NULL REFERENCES go_concepts(id) ON DELETE CASCADE,
    times_taught       INT  NOT NULL DEFAULT 0,
    last_taught_at     TIMESTAMPTZ,
    user_demonstrated  BOOLEAN NOT NULL DEFAULT FALSE,
    demonstrated_at    TIMESTAMPTZ,
    PRIMARY KEY (user_id, concept_id)
);
CREATE INDEX idx_user_concepts_seen_user ON user_concepts_seen (user_id);

CREATE TABLE action_history (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT  NOT NULL,
    game_id     UUID,
    problem_id  TEXT,
    concept_id  TEXT,
    reason      TEXT,
    picked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_action_history_user_time ON action_history (user_id, picked_at DESC);

ALTER TABLE games ADD COLUMN IF NOT EXISTS training_mode BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS move_notes (
  game_id       UUID    NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number   INT     NOT NULL,
  for_user_id   UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier          TEXT    NOT NULL CHECK (tier IN ('yellow', 'red')),
  body_md       TEXT    NOT NULL,
  concept_ids   TEXT[]  NOT NULL DEFAULT '{}',
  model         TEXT    NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, move_number, for_user_id)
);

CREATE TABLE IF NOT EXISTS player_move_notes (
  game_id     UUID        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number INT         NOT NULL,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (char_length(body) <= 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, move_number, user_id)
);

CREATE TABLE IF NOT EXISTS coach_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS coach_turns (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID        NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
  turn_number         INT         NOT NULL,
  role                TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  invocation_mode     TEXT        NOT NULL,
  user_input          TEXT,
  assistant_output_md TEXT,
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
