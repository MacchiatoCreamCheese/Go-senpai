Before the schemas, three framing decisions I'm making (push back if any are wrong):

- **Single-page app, route-driven**, using React Router. No SSR.
- **Identity for now is the existing `handle`-based system** (no auth until Phase 5), so I'll show user identity as a header dropdown but treat login as a stub.
- **The `sensei-ai` reserved user is treated specially in the UI** — shown with an AI badge, no profile link, listed as opponent option in the lobby's "Play AI" flow.

---

## Information architecture

```
/                          Home (dashboard if logged in, landing if not)
/lobby                     Lobby — open games, create game, play AI
/play/:gameId              Live game board (in-progress)
/games/:gameId             Completed game viewer (replay + review tabs)
/games/:gameId/review      Same view, review tab pre-selected
/drill                     Drill session (next problem from planner)
/drill/:problemId          Specific problem view
/profile                   Current user's profile (weaknesses, history, progress)
/profile/:userId           Other user's profile (limited view)
/games                     User's game history (filterable list)
/concepts                  Browse Go concept library
/concepts/:conceptId       Single concept detail
/coach                     The agentic session screen — "what should I do next?"
/settings                  Preferences (board theme, sound, notifications)
```

**Persistent shell on every authenticated screen:**
- Top nav: logo → Home, Lobby, Coach, Drill, Games, Profile, user dropdown
- Bottom-right: small "Coach" floating button (jumps to `/coach`)
- Toast notifications for async events (review ready, drill complete, etc.)

---

## Screen-by-screen schema

### 1. Home / Dashboard (`/`)

The landing screen for a returning user — designed to *show the agentic system at work*, not a generic welcome.

**Layout (desktop):** 3-column responsive grid that collapses to single column on mobile.

**Sections:**

- **"Next action" hero card** (full width, top)
  - Calls `POST /users/{id}/next-action` — but renders the suggestion, doesn't auto-execute.
  - Shows the planner's chosen action: review a game / drill a tsumego / learn a concept / revisit / idle.
  - Action card variants:
    - `review_game` → "Your last game has lessons waiting" + thumbnail of final position + CTA button "Review now"
    - `serve_drill` → "Practice: empty triangle shapes" + small board preview + "Start drill"
    - `teach_concept` → "Learn: the hane at the head of two stones" + concept icon + "Read"
    - `revisit_concept` → "Refresh: ladder reading" + "Quick review"
    - `idle` → "You're up to date — play a game when ready" + "Play AI" / "Play human" buttons

- **Recent games** (left column)
  - Last 5 games as compact cards.
  - Each: opponent name (or "Sensei AI 12k"), result, board size, played-at, "Reviewed ✓" badge if review exists.
  - Click → `/games/:gameId`.
  - "View all →" footer link to `/games`.

- **Weakness model snapshot** (middle column)
  - Top 3 weaknesses sorted by severity.
  - Each row: theme name, severity bar (0–1), evidence count ("seen in 4 games"), last-seen date.
  - Tooltip on hover explains the theme.
  - "Full profile →" → `/profile`.

- **Progress strip** (right column)
  - Rank estimate (if set) with trend arrow.
  - Drills attempted this week.
  - Reviews read this week.
  - Concepts learned (count, of N total).

**Data sources:**
- `POST /users/{me}/next-action`
- `GET /users/{me}/games?limit=5`
- `GET /users/{me}/weaknesses?limit=3&sort=severity`
- `GET /users/{me}/progress` (you may need this; see API gaps section below)

---

### 2. Lobby (`/lobby`)

Game creation and matchmaking. You already have most of this; mostly polish + the AI option from Phase 3.

**Layout:** Two-column — open games list (left, 2/3), create-game panel (right, 1/3).

**Sections:**

- **Open games list**
  - Filter chips: all / 9×9 / 13×13 / 19×19, casual / ranked.
  - Each row: creator handle, board size, ruleset, komi, color preference, "Join" button.
  - Calls `POST /games/{id}/join` (your existing endpoint).
  - Empty state: "No open games. Create one or play the AI."

- **Create game panel**
  - Tabs: **Play Human** | **Play AI**
  - **Play Human form:**
    - Board size (9 / 13 / 19)
    - Komi (default per board size, editable)
    - Color preference (Black / White / Random)
    - Swap colors toggle (uses your `swap_colors` endpoint)
    - "Create" → `POST /games`
  - **Play AI form** (Phase 3):
    - Board size
    - AI rank slider (e.g., 20k → 5d) — drives `ai_rank` field
    - Color preference
    - "Start" → `POST /games` with `opponent_type=ai`, `ai_rank=...`, then auto-routes to `/play/:gameId`

- **My active games strip** (top of page if any exist)
  - Horizontal scroll of in-progress games to resume.

**Data sources:**
- `GET /games?status=open`
- `GET /users/{me}/games?status=in_progress`
- Your existing `POST /games`, `POST /games/{id}/join`, `swap_colors` endpoints

---

### 3. Live game board (`/play/:gameId`)

The in-game screen — board + game info + controls. Connects to your WebSocket layer for live state.

**Layout:** Centered board, side panels on desktop (info left, moves right), bottom controls on mobile.

**Sections:**

- **Board** (center, dominant)
  - `@sabaki/shudan` as you have it.
  - Last-move marker, capture animation, hover preview.
  - For AI games: a subtle "AI thinking…" indicator over the board when it's the AI's turn.

- **Player panels** (top and bottom, or left side)
  - Each shows: avatar, handle, rank, captures count, color stone.
  - Active player highlighted.
  - For Sensei AI: AI badge + rank label.

- **Move list** (right side, scrollable)
  - Numbered moves (1. B Q16 / W D4, etc.)
  - Click a move → board jumps to that position (read-only preview).
  - "Back to live" button when previewing.

- **Controls** (bottom)
  - Pass / Resign (with confirm modal for resign)
  - Undo (if your game logic supports it; doesn't in standard rules, so probably skip)
  - SGF download → `GET /games/{id}/sgf`

- **Post-game overlay** (modal that appears when game ends)
  - Result banner (e.g., "Black wins by 7.5")
  - Two big CTAs:
    - "Review this game" → kicks off `POST /games/{id}/analyze` then `POST /games/{id}/review`, routes to `/games/:gameId/review`
    - "Back to lobby"
  - For AI games: "Play again" with same settings

**Data sources:**
- WebSocket: `/ws/games/:gameId` (your existing layer) for moves, captures, clock if you have one
- `POST /games/{id}/move` (your existing) or via WS
- `POST /games/{id}/ai-move` (Phase 3) — or this happens server-side on AI's turn

---

### 4. Completed game viewer (`/games/:gameId`)

The most important screen in the whole app. This is where the agentic value gets demonstrated.

**Layout:** Large board left (60%), tabbed panel right (40%).

**Sections:**

- **Board with move scrubber**
  - Same `@sabaki/shudan` component, read-only.
  - Bottom of board: scrubber (◄◄ ◄ play/pause ► ►►), move counter "Move 47 / 218", keyboard arrow support.
  - **Engine overlay toggles** (top-right of board):
    - Show ownership map (color-coded territory from KataGo)
    - Show top moves (small numbered circles for KataGo's top-N suggestions)
    - Show variation (when a moment is selected from review)
  - **Score bar** below board showing score lead through the game (line chart, current move marked).

- **Right panel — tabs:**

  **Tab A: Review** (default if review exists)
  - Header: "Reviewed for you (Black)" or "(White)" + model name + generated-at time + regenerate button.
  - **Summary card** at top: 2-sentence overall summary from the LLM.
  - **Moments list** (scrollable): each moment is a card containing:
    - Move number badge ("Move 47")
    - Severity tag ("Blunder, −8.4 pts" or "Inaccuracy, −2.1 pts")
    - What happened (1 sentence)
    - Why it was wrong (2–3 sentences, references engine features)
    - Better move (with small inline board snippet showing the variation)
    - Concept badge ("Empty triangle" — clickable → `/concepts/empty_triangle`)
    - "Show on board →" button — selects this moment on the main board, draws variation
  - **Footer actions:** "Mark as helpful / not helpful" (feedback for your evaluation), "Add to study list"

  **Tab B: Analysis** (raw KataGo data, for power users)
  - Per-move table: move # | color | played | top move | points lost | win% before/after | rank
  - Sortable columns, filter by "blunders only", "by phase"
  - Click row → board jumps there

  **Tab C: Info**
  - Players, board size, komi, ruleset, result, date, duration, opponent type (human/ai/ai_rank)
  - SGF download
  - Share link (copies URL)

- **No-review state** (when review hasn't been generated yet):
  - Big empty-state card on the Review tab: "No review yet" + button "Generate review (~30s)"
  - Spinner state during generation, polling `GET /games/{id}/review`

**Data sources:**
- `GET /games/{id}` — game metadata + moves + sgf
- `GET /games/{id}/analysis` — Phase 1 features for board overlays and analysis tab
- `GET /games/{id}/review` — Phase 2 review payload
- `POST /games/{id}/review` — to generate (returns 202 + polling, or sync if fast)

---

### 5. Drill session (`/drill`)

Phase 4 — the personalized training loop.

**Layout:** Centered problem board, side panel for context, bottom for actions.

**Sections:**

- **Header strip**
  - "Practicing: Empty Triangle Shapes" (theme being targeted)
  - Streak counter (current session: ✓✓✓✗✓)
  - Problems remaining indicator ("Problem 3 of 5")
  - "End session" button

- **Problem board** (center)
  - The tsumego position rendered.
  - Color-to-play indicator above board ("Black to play and live" / "...and kill").
  - User clicks intersections to play moves.
  - Solution validation: after each move, the system checks against `problems.solution` and either advances (correct) or shows feedback (wrong).

- **Hint panel** (right)
  - Difficulty rating (1–10)
  - Themes badges (clickable → `/concepts/...`)
  - "Hint" button (reveals first move; flags `hint_used=true`)
  - "Show solution" button (gives up; counted as fail)

- **Result modal** (after attempt completes)
  - Success: ✓ "Solved!" + time taken + "Next problem" CTA
  - Failure: ✗ "Solution was..." + step-through of correct moves + "Next problem" CTA
  - Both: "I want to study this concept" → routes to `/concepts/:id`

- **End-of-session summary** (after N problems or user ends)
  - Score: 4/5 solved
  - Themes practiced
  - Severity update preview ("Empty triangle severity decreased: 0.78 → 0.61")
  - CTA: "Back to home" / "Another session"

**Data sources:**
- `GET /users/{me}/next-problem` (Phase 4)
- `POST /drill-attempts`
- `GET /problems/{id}` (for direct-link `/drill/:problemId` access)

---

### 6. Coach (`/coach`)

The agent's "session view" — explicit interface to the orchestrator. This screen makes the agentic nature of the app legible.

**Layout:** Conversation-like vertical feed.

**Sections:**

- **Header**
  - "Your coaching session"
  - Last session date
  - "Start session" button (calls `POST /users/{me}/next-action`)

- **Action feed** (chronological, top-down)
  - Each completed action rendered as a card showing:
    - Action type icon + label ("Reviewed your game vs. Sensei AI 12k")
    - Timestamp
    - Brief outcome ("3 moments identified, 1 marked helpful")
    - "View" button to the underlying artifact (game review, drill session, concept page)
  - Includes idle actions: "You're up to date — keep playing"

- **Current action** (top of feed during active session)
  - Loading state while planner is choosing
  - Then the action card with "Do it now" / "Skip" buttons
  - Skipping logs the skip and re-plans

- **Optional: planner reasoning** (collapsible "Why this?" on each action)
  - Pulls from logged action context
  - "Selected because: empty_triangle severity 0.78, last seen in your last 3 games, 4 problems available targeting this theme"
  - This is a *huge* selling point for the agentic framing — makes the planner legible.

**Data sources:**
- `POST /users/{me}/next-action`
- `GET /users/{me}/action-history` (you'll need this)

---

### 7. Profile (`/profile` and `/profile/:userId`)

User's full picture — weaknesses, history, progress.

**Layout:** Header summary + tabbed sections below.

**Header card:**
- Avatar, handle, rank estimate
- Member-since date
- Counts: games played, reviews, drills attempted, concepts learned
- (Own profile only) Edit handle / settings link

**Tabs:**

  **Tab A: Weaknesses**
  - Sorted list of all weaknesses (not just top 3).
  - Each: theme name, severity bar, evidence count, last-seen date, trend (improving / stable / worsening based on recent updates).
  - Click theme → expanded view with linked games where it appeared + linked concepts.

  **Tab B: Game history**
  - Same as `/games` but scoped to this user.
  - Filters: by opponent type, board size, result, has-review.

  **Tab C: Concepts learned**
  - Grid of concept cards from `user_concepts_seen`.
  - Each shows times-taught, last-taught-at, demonstrated badge if `demonstrated_at` is set.
  - Click → `/concepts/:id`.

  **Tab D: Progress chart**
  - Rank estimate over time (line chart).
  - Drills-per-week bar chart.
  - Severity-of-top-weakness over time.

**Data sources:**
- `GET /users/{id}` — basic info
- `GET /users/{id}/weaknesses`
- `GET /users/{id}/games`
- `GET /users/{id}/concepts`
- `GET /users/{id}/progress` (timeseries)

---

### 8. Game history (`/games`)

All games for the current user, filterable.

**Layout:** Filter bar + table/list.

**Filters:** opponent type (any/human/ai), board size, result (won/lost), has review (yes/no), date range.

**Each row:** date, opponent (with AI badge if applicable), board size, color you played, result (W/L + score), review status, "View" → `/games/:gameId`.

**Pagination:** standard.

**Data sources:**
- `GET /users/{me}/games?...filters` — returns paginated list

---

### 9. Concept library (`/concepts`)

Browse Go concepts your retrieval corpus knows about.

**Layout:** Grid of concept cards with category filter sidebar.

**Sidebar filters:** Tag groups from `go_concepts.tags` — shape, life-and-death, opening, endgame, fuseki, joseki, tesuji, etc.

**Each card:** concept name, short summary (first sentence of body), tags, "learned" badge if user has seen it.

**Search bar:** semantic search using the existing `pgvector` index — type "what to do when opponent has a wall" and get back relevant concepts.

**Data sources:**
- `GET /concepts?tag=shape&q=...`
- Backend uses ivfflat semantic search

---

### 10. Concept detail (`/concepts/:conceptId`)

Single concept page — read the lesson.

**Layout:** Long-form article with sidebar.

**Sections:**
- Title + tags + difficulty
- Body (markdown rendered)
- Inline diagrams (you may not have these; could be a Phase 5 polish item — for now, let the body include text-described positions or simple ASCII)
- "Games where this came up for you" — linked list pulled from your reviews that referenced this concept
- "Practice problems for this concept" — linked drills filtered by `themes`
- "Mark as understood" button → updates `user_concepts_seen.user_demonstrated`

**Data sources:**
- `GET /concepts/:id`
- `GET /users/{me}/concept-context/:id` (which games and problems relate)

---

### 11. Settings (`/settings`)

Preferences. Can be minimal in early phases.

**Sections:**
- Board theme (wood / slate / japanese / minimal)
- Stone style (classic / 3D / flat)
- Sound on/off
- Coordinate display on/off
- Default board size
- Auto-generate review on game end (toggle)
- LLM model preference (if you offer alternatives)
- Delete account (Phase 5)

**Data sources:**
- `GET /users/{me}/settings`
- `PATCH /users/{me}/settings`

---

## Cross-cutting UI components (reusable)

You'll build these once and use everywhere:

- **`<GoBoard>`** — wraps `@sabaki/shudan`, accepts position + overlays (ownership, top moves, variation arrows).
- **`<MoveScrubber>`** — playback controls + keyboard nav.
- **`<ScoreLineChart>`** — KataGo score lead over time, brushable.
- **`<MomentCard>`** — the structured review-moment card used in the review tab.
- **`<WeaknessBar>`** — theme + severity bar + evidence count.
- **`<ConceptBadge>`** — clickable concept tag.
- **`<ActionCard>`** — used on home and `/coach` for planner actions.
- **`<UserChip>`** — avatar + handle + rank, with AI badge variant.
- **`<EngineOverlay>`** — toggles for ownership / top moves / variation on the board.
- **`<NotificationToast>`** — async event notifications.

---

## API gaps the frontend will need (not in your current backend)

Based on this design, here are endpoints you don't have yet but will need. Listed by phase so you can fold them in:

**Phase 2 needs:**
- `GET /games?status=open|in_progress` and `GET /users/{id}/games?...filters` with proper filter support
- `POST /games/{id}/review/feedback` — for the helpful/not-helpful buttons (also feeds your evaluation)

**Phase 4 needs:**
- `GET /users/{id}/weaknesses` — list with sort/limit
- `GET /users/{id}/concepts` — what they've seen + demonstrated status
- `GET /users/{id}/next-problem` — drill selector
- `POST /drill-attempts` — log attempt
- `GET /users/{id}/action-history` — for the `/coach` feed
- `GET /users/{id}/progress` — timeseries for charts (could be computed from existing tables)

**Phase 5 needs:**
- `GET /users/{id}/settings` and `PATCH /users/{id}/settings`
- Auth endpoints (Supabase or Auth.js handles this)

**Concept browsing (Phase 4 sensible to build with drill module):**
- `GET /concepts` with tag filter and semantic search query param
- `GET /concepts/:id`
- `GET /users/{me}/concept-context/:id`

---

## Routing and state strategy

A few opinionated calls:

- **React Router v6+** with a top-level layout route for the persistent shell.
- **Server state via TanStack Query (React Query).** Don't put server data in Redux/Zustand. Query handles caching, refetch, optimistic updates — perfect for this kind of app.
- **Local UI state via `useState`/`useReducer`.** No global state library needed.
- **WebSocket state via a custom hook** that subscribes per-game, integrates with React Query's cache for optimistic updates.
- **URL-driven where possible.** Filters on `/games`, selected moment on `/games/:gameId?moment=47`, drill problem ID in URL. Means deep links and shareable URLs work for free.

---

## Build order (matching your phases)

To avoid building screens before their backend exists:

| Backend phase | Frontend screens to build |
|---------------|--------------------------|
| Phase 0 (DB persistence) | No new screens; just fix existing screens to call persisted endpoints |
| Phase 1 (KataGo + features) | `/games/:gameId` Analysis tab + board overlays |
| Phase 2 (Review) | `/games/:gameId` Review tab + post-game overlay on `/play/:gameId` |
| Phase 3 (AI opponent) | "Play AI" tab in lobby + AI badge in player panels |
| Phase 4 (Agent + drills) | Home dashboard, `/coach`, `/drill`, `/profile` weaknesses tab, `/concepts/*` |
| Phase 5 (Auth + polish) | `/settings`, real login, profile editing, polish across all screens |
| Phase 6 (Eval) | Add feedback buttons everywhere they make sense |

This means in Phase 1, your only frontend work is enhancing the game viewer with engine data — small, focused, demo-able. By Phase 4 you're shipping screens fast because the components are mature.

