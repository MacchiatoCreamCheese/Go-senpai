CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle      TEXT NOT NULL UNIQUE,
    rank_estimate TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE games (
    id              UUID PRIMARY KEY,
    black_user_id   UUID NOT NULL REFERENCES users(id),
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
