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
