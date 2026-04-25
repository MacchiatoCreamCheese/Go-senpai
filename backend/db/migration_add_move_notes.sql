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
