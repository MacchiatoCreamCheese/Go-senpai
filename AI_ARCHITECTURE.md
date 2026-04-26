# How Go-senpai Handles AI

Go-senpai pairs KataGo's brute-force board analysis with an LLM to give the kind of feedback a human coach would — "you lost the fight because you ignored the cut on move 34" — and then tracks what you struggle with over time to serve drills and concepts that actually target your gaps. None of the agentic decision-making uses the LLM; all session orchestration is a plain deterministic function.

---

## System Map

```
  You play a game
        |
        v
   [ KataGo ]  <-- scores every move: winrate, points lost, best alternative
        |
        v
  [ move_features ]  stored in DB per move per player
        |
   _____|_____________________________________
  |          |              |                |
  v          v              v                v
[Reviewer] [Coach]      [Weakness]       [Planner]
  |          |           Extractor          |
  |          |              |               |
  v          v              v               v
[Embedding] [Embedding]  [EMA update]   [Drill Picker]
 search      search       per theme      (tsumego)
  |          |
  v          v
 [LLM]     [LLM streaming]
  |          |
  v          v
 Full-game  Real-time
 breakdown  dialogue
```

---

## Components

### A. KataGo — the board analysis engine

**Plain English:** KataGo reads the board at every move and asks "how bad was that, really?" It plays out thousands of scenarios internally and scores each decision.

**Technically:**
- Run per game on request (lazy — only when a review is triggered)
- 40 visits for coach mode, up to 500 for full review
- Per-move outputs stored as `move_features` rows:
  - `winrate` — probability of winning at that moment
  - `score_lead` — point advantage/disadvantage
  - `points_lost` — how much worse your move was vs. the best move
  - `policy_rank` — how highly KataGo's policy network ranked your move (0 = top choice)
  - `score_stdev_before` — uncertainty (high in complex fights, low in clear endgames)
  - `is_blunder` — boolean flag computed from `points_lost` threshold
  - `top_move` — the coordinate KataGo would have played instead
  - `phase` — `opening` / `middlegame` / `endgame`

---

### B. Weakness Extractor — no LLM, pure math

**Plain English:** After each game, six "bad habit" scores are computed from the KataGo data. Did you blunder a lot in the opening? Did you repeatedly ignore the engine's top suggestion? These become a profile of what you struggle with.

**Technically:** (`backend/app/services/weakness/extractor.py`)

Six themes, each scored 0→1:

| Theme | What it measures | Formula |
|---|---|---|
| `blunder_opening` | Blunder rate in moves 1–~40 | blunders / moves in phase |
| `blunder_middlegame` | Blunder rate in the middle | blunders / moves in phase |
| `blunder_endgame` | Blunder rate late game | blunders / moves in phase |
| `ignored_top_move` | How often you skip the engine's top suggestion | moves where `policy_rank ≥ 5` AND `points_lost ≥ 1.0` |
| `low_consistency_opening` | Many small mistakes (not one big blunder) | mean confidence-weighted `points_lost`, normalized by threshold 1.5 |
| `low_consistency_endgame` | Same but endgame | mean confidence-weighted `points_lost`, normalized by threshold 1.0 |

Confidence weighting: scores in uncertain positions (`score_stdev_before` high) are discounted so a complex fight doesn't unfairly inflate your weakness score.

The scores are **EMA-updated** across games: `new = (1 − α) × old + α × evidence`, with α=0.3 for games and α=0.15 for drills. Zero evidence decays the weakness toward 0 over time.

---

### C. Concept Retrieval — embedding search

**Plain English:** The app has a library of Go teaching concepts (e.g., "capturing races", "endgame tesuji"). When picking what to show you, it finds the concepts most mathematically similar to your current mistake.

**Technically:** (`backend/app/services/review/retriever.py`)
- Embedding model: `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions), lazy-loaded
- Each concept in the DB has a pre-computed embedding vector
- At review time: each selected moment → query string (phase + kind + points\_lost + top\_move) → cosine similarity search → top 3 concepts returned
- Coach mode: top 2 concepts retrieved per turn

---

### D. Game Reviewer — full post-game LLM call

**Plain English:** When you request a review, the app selects the 4 most instructive moments from your game, finds relevant teaching concepts, and sends everything to the LLM with a prompt like "you're a Go coach, here are the key moments, explain them to a beginner/intermediate/expert." The result is stored.

**Technically:** (`backend/app/services/review/reviewer.py`, `prompt.py`, `selector.py`)

1. **Moment selection** — picks up to 4 moves:
   - Blunders first, ranked by `points_lost`
   - Then critical decisions: `points_lost ≥ 1.5` points AND confidence-weighted loss ≥ 1.5
   - Cap: max 2 moments per phase (opening/middlegame/endgame)

2. **Prompt construction** — two parts:
   - *System:* rank-aware tone (beginner / intermediate / expert); hard rules: only reference moves KataGo provided, don't invent variations
   - *User:* JSON payload:
     ```json
     {
       "game": { "board_size": 19, "komi": 6.5, "result": "B+3.5", "reviewing_color": "black" },
       "moments": [
         {
           "move_number": 34,
           "played_coord": "Q16",
           "top_move": "R16",
           "points_lost": 3.2,
           "winrate_before": 0.58,
           "phase": "middlegame",
           "kind": "blunder",
           "retrieved_concepts": [...],
           "continuation": [...]
         }
       ],
       "concept_library": { "concept_id": { "title": "...", "body_md": "..." } }
     }
     ```

3. **LLM call** — non-streaming, expects JSON back:
   ```json
   {
     "summary_md": "Two sentences on the overall game.",
     "moments": [
       { "move_number": 34, "explanation_md": "...", "concept_ids": ["capturing_races"] }
     ]
   }
   ```

4. **Caching** — SHA256 of (model + system + user) → in-memory LRU, max 64 entries

5. **Result** — stored in DB; token count tracked

---

### E. Move Note Generator — single-move LLM call

**Plain English:** A shorter version of the reviewer: 80–120 words on one specific move. Labels it red/orange/yellow/green (blunder → suboptimal → good) and explains why.

**Technically:** (`backend/app/services/review/note_generator.py`)
- Same LLM client as the reviewer
- Tier thresholds computed from `points_lost`
- Teaching concept recorded when a note is generated (feeds into concept history)

---

### F. Coach Session — real-time streaming dialogue

**Plain English:** While looking at your game, you can talk to the coach. It won't just hand you the answer — it asks questions and guides you toward seeing the problem yourself. The conversation continues across messages.

**Technically:** (`backend/app/services/coach/session.py`, `coach_prompts.py`)

**4 dialogue modes:**

| Mode | What it does | Coordinate policy |
|---|---|---|
| `whats_missing` | Points out areas of the board you're ignoring | No coordinates (Socratic) |
| `help_read_fight` | Helps you read a tactical sequence | Coordinates allowed |
| `whats_my_plan` | Discusses territorial strategy using ownership map | No coordinates |
| `followup` | Continues the prior turn | Inherits from prior mode |

**Each turn:**
1. KataGo analyzes the current position (40 visits; ownership map for `whats_my_plan`)
2. Context assembled in parallel:
   - Last 6 turns from DB
   - Your move annotations (player notes)
   - Your rank estimate
   - Your top-3 weaknesses
   - Concepts taught in the last 7 days
   - Top-2 retrieved concepts for this position
3. Prompt sent to LLM with ≤150-word output limit
4. Response streamed as SSE tokens: `{"type": "token", "content": "..."}`
5. **Guardrail:** if the response contains a board coordinate (`A1`–`T19`) in a no-spoiler mode, those tokens are stripped and a note is appended
6. Full response + user message saved to `coach_turns` table; session continues via `session_id`

---

### G. Drill Picker — adaptive tsumego selector

**Plain English:** Picks the next Go puzzle (tsumego) that matches your weakest skill and your current level — not too easy, not too hard, and not one you just solved.

**Technically:** (`backend/app/services/drills/selector.py`, `picker.py`)

1. Your weaknesses map to problem themes:

| Weakness theme | Problem themes served |
|---|---|
| `blunder_opening` | `opening_shape`, `joseki_punish` |
| `blunder_middlegame` | `capturing_race`, `cutting`, `sabaki` |
| `blunder_endgame` | `endgame_tesuji`, `counting` |
| `ignored_top_move` | `tesuji`, `shape` |
| `low_consistency_*` | opening / endgame themes |

2. Candidate pool: 50 problems fetched by theme match (or random fallback)
3. Each problem scored:
   - `+ severity` for each matching weakness theme
   - `− 1.0` if seen in last 5 problems
   - `− 0.25` per difficulty step away from your target rank
4. Top score wins; on drill success, related weakness EMA decays (α=0.15)

---

### H. Session Planner — the agentic orchestrator (no LLM)

**Plain English:** When you open the app, something decides what to show you next: review that old game, learn a new concept, revisit one you haven't practiced, or do a drill. That decision is made by a pure deterministic function — no LLM involved.

**Technically:** (`backend/app/services/orchestrator/planner.py`, `runner.py`)

`choose_next_action()` is a pure function (no DB, no randomness). Priority order:

```
1. review_game        — unreviewed game exists?
                        (skip if same game was suggested <15 min ago)
2. revisit_concept    — concept was taught but never demonstrated?
                        (only if last taught ≥24h ago)
3. teach_concept      — highest-severity weakness ≥ 0.2 with a new/stale concept?
                        (reteach if not demonstrated and last taught ≥7 days ago)
4. serve_drill        — candidate drill available?
                        (skip if last 2 actions were both drills — stay varied)
5. idle               — nothing to do
```

The runner (`runner.py`) loads all inputs in parallel, peeks drill availability, calls `choose_next_action()`, executes the tail action (fetch game/concept/drill row), and logs to `action_history`.

Weakness → concept mapping is hardcoded in the planner (easy to version-control):
```python
"blunder_opening"         → "opening_principles"
"blunder_middlegame"      → "capturing_races"
"blunder_endgame"         → "endgame_tesuji"
"ignored_top_move"        → "shape_fundamentals"
"low_consistency_opening" → "opening_principles"
"low_consistency_endgame" → "endgame_tesuji"
```

---

### I. LLM Client — the provider abstraction

**Plain English:** One layer that handles talking to Claude or Gemini. Swap providers with an env var.

**Technically:** (`backend/app/services/review/llm.py`)

- **Providers:** `ClaudeClient` (`AsyncAnthropic`) and `GeminiClient` (`google-genai`)
- **Selection:** `REVIEW_LLM_PROVIDER` env var (`"claude"` default)
- **Retry:** 2× exponential backoff — waits 1s then 3s — on HTTP 408/425/429/500/502/503/504 or `"UNAVAILABLE"` strings
- **JSON extraction:** tries `json.loads()` first; falls back to regex `{...}` block search (handles models that wrap JSON in prose or markdown fences)
- **Streaming:** Claude uses native `messages.stream()`; Gemini fakes streaming by returning the full response in one chunk
- **Token tracking:** input + output tokens counted and stored for every review call

---

## What "Agentic" Means Here

The system does **not** use LLM tool calls or function calling anywhere. There is no agentic loop where the LLM decides what to do next.

"Agentic" in Go-senpai means:

1. **The planner acts on your behalf without you choosing each step.** You don't pick "review game" or "do a drill" — the system reads your weakness state and makes that call.
2. **Decisions chain across sessions.** What it taught you last week (concept history), whether you demonstrated it (demonstrated flag), and what you played recently (weakness EMA) all feed the next session's plan.
3. **LLM outputs are tightly constrained** to keep behavior predictable: JSON schema enforced by the reviewer, word limits in the coach, coordinate guardrails in no-spoiler modes.

The LLM's job is **language** (explain, coach, narrate). The agent's job is **strategy** (what to work on, in what order). These are deliberately separated.

---

## Lifecycle Flows

### Weakness lifecycle
```
Any game ends (including training mode games)
  → extract_evidence(move_features)   [pure function, 6 theme scores]
  → apply_evidence(user_id, game_id)  [EMA update per theme, α=0.3; deduped by game_id]
  → planner reads weaknesses          [on next /next-action call]
  → coach prompt includes top-3       [in each coach turn, W4]
  → drill picker maps theme → problem [on /next-problem call]

Drill attempt succeeds (W3)
  → weakness_themes_for_problem(problem.themes)  [reverse map]
  → EMA decay toward 0 for each matched theme, α=0.15
```

### Concept lifecycle
```
Three triggers write to user_concepts_seen:

1. Planner fires teach_concept
     → concept row fetched from DB
     → returned to frontend (body_md shown to user)
     → record_concept_taught(user_id, concept_id)  [times_taught += 1]

2. Move note fetched (GET /games/{id}/moves/{n}/note)  [W1]
     → LLM generates note with concept_ids
     → record_concept_taught() for each concept_id in the note

3. Coach turn completes  [W2]
     → retriever finds top-2 concepts for this position
     → record_concept_taught() for each retrieved concept

After any of the above:
  → coach prompt includes concepts taught in last 7 days  [W4]
  → if not demonstrated after 24h → revisit_concept action
  → if not demonstrated after 7 days → reteach
```

### Review pipeline
```
POST /api/games/{id}/review
  → KataGo analyzes all moves (if not already cached)
  → selector picks up to 4 key moments
  → retriever finds top-3 concepts per moment (embedding search)
  → prompt builder assembles rank-aware system + JSON user prompt
  → LLM call → summary_md + per-moment explanation_md
  → stored in DB (with token count and model name)
  → weakness extractor runs fire-and-forget in background
```

---

## Configuration

| Env var | Default | What it controls |
|---|---|---|
| `REVIEW_LLM_PROVIDER` | `claude` | `claude` or `gemini` |
| `REVIEW_LLM_MODEL` | `claude-haiku-4-5` / `gemini-2.5-flash` | any model the provider supports |
| `ANTHROPIC_API_KEY` | — | required if provider = claude |
| `GOOGLE_API_KEY` | — | required if provider = gemini |
| `REVIEW_EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | concept similarity model |
| `KATAGO_ENABLED` | `false` | set `true` in prod; dev mode skips the engine |
| `KATAGO_MAX_VISITS` | `500` | analysis depth (higher = slower but stronger) |
| `KATAGO_ANALYZE_TIMEOUT` | `60s` | per-position time budget |
