CREATE TABLE IF NOT EXISTS player_move_notes (
  game_id     UUID        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  move_number INT         NOT NULL,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (char_length(body) <= 300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, move_number, user_id)
);
