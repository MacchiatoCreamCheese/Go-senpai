# Tsumego seed corpus

Each problem is:

- An SGF file in this directory (filename = problem id, e.g. `starter-01.sgf`).
- An entry in `../problems.json` with themes, difficulty, source, and an ordered solution move list.

The starter set here is a handful of trivial positions for the drill selector
to exercise. To grow the corpus, pull SGFs from the public-domain
[xhu4/tsumego](https://github.com/xhu4/tsumego) collection (Cho Chikun
Elementary, Gokyo Shumyo) and add a manifest entry for each.

Theme vocabulary (open-ended; matches `WEAKNESS_TO_PROBLEM_THEMES` in
`app/services/drills/selector.py`):
`opening_shape`, `joseki_punish`, `capturing_race`, `cutting`, `sabaki`,
`endgame_tesuji`, `counting`, `tesuji`, `shape`.

To load into the DB:

```
python backend/scripts/load_problems.py
```

Re-runnable: upserts by id.
