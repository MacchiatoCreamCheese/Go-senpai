# Go-senpai — For the Designer

This document describes every screen, feature, and interaction in the current app. You don't need to read any code. Use this as the source of truth for what exists today, then design freely — layout, style, color, flow, art are all yours to reimagine.

---

## What the App Does (One Paragraph)

Go-senpai is a Go (baduk) learning companion. You play games against an AI opponent, and after each game an AI coach reviews your play, highlights your biggest mistakes, and explains them in plain language. Between games, a planner tracks what you consistently struggle with and assigns you targeted practice: tsumego puzzles (tactical problems), Go concepts to read, or old games to review. During a live game you can also open a chat with the coach and ask questions like "what am I missing on this board?"

---

## Navigation Structure

There is one persistent top navigation bar. It appears on every screen except during a live game (the board takes over the full screen).

**Top nav contains:**
- Logo (先 — the kanji for "ahead/senior/teacher") → goes Home
- Links: Home · Lobby · Coach · Drill · Games · Concepts · Profile
- User menu (top right) → Profile / Settings / Sign out

**Floating button:** A "Ask Sensei" button floats over every screen except the live game board (where the coach lives inside the game panel).

---

## Screens

---

### 1. Home `/`

**Purpose:** The starting point after sign-in. Shows your current status at a glance and lets you ask the AI what to do next.

**What's on screen:**

When **not signed in:**
- Large kanji mark (先)
- "Welcome to Go-senpai" heading
- One call-to-action button: **Go to Lobby**

When **signed in:**
- "Welcome back" + your display name
- Button: **What should I do next?** — asks the AI planner what you should do in this session; becomes **Get a new action** once an answer is shown
- A card showing the planner's suggestion (see ActionCard below)
- Three columns below:
  - **Recent games** — last 5 games, each showing board size, result, date. Link: "View all →"
  - **Top weaknesses** — your top 3 weak areas shown as progress bars. Link: "Full profile →"
  - **This week** — 4 stats: games played, games finished, drills done, concepts learned. Link: "See progress →"

---

### 2. Login `/login`

**Purpose:** Sign in or create an account.

**What's on screen:**
- Button: **Continue with Google**
- Divider ("or")
- Two tabs: **Password** | **Magic link**

**Password tab:**
- Email input
- Password input
- Button: **Sign in** (or **Create account** — same button, different label depending on toggle)
- Toggle link: "Don't have an account? Create one" ↔ "Already have an account? Sign in"
- Error text (shown when something goes wrong)

**Magic link tab:**
- Email input
- Button: **Send magic link**
- Explanation: "No password. We email you a one-time link."
- After sending: confirmation message + **Use a different email** button

---

### 3. Lobby `/lobby`

**Purpose:** Create a new game or join one someone else started.

**What's on screen:**
- Large background kanji (碁 — "Go/the game of Go")
- Heading: "Lobby"
- Tagline

**If you have in-progress games:**
- Horizontal scrolling strip: **Resume an in-progress game** — each card shows board size and a "Resume →" link

**New game section:**
- Two opponent buttons: **vs Human** · **vs Sensei AI**
- If AI chosen: a **rank slider** (from 4-dan professional down to 20-kyu beginner) + a **Training mode** checkbox ("show coaching dots after each move")
- Color choice: **Black** (moves first) · **White**
- Board size: **9×9** · **13×13** · **19×19**

**Join game section** (only vs Human):
- Text input for a game ID + **Join** button

---

### 4. Live Game `/play/:gameId`

**Purpose:** Play the game. This is the primary active screen. The top nav disappears here.

**Layout:** Board on the left, game panel on the right.

#### Left — Board
- The Go board (click to place your stone when it's your turn)
- "Sensei is thinking…" overlay with animated dots (while the AI computes its move)
- Game ID tag with copy button

#### Right — Game Panel

- **Players** — shows both players (you and opponent) with their colors
  - **Swap colours** button (only before game starts)
- **Turn indicator** — "Black — your move" / "Black — waiting" / "Sensei is thinking…" / game over
- **Captures** — how many stones each side has captured
- **Move history** — scrolling list of every move played (number, color, coordinate); auto-scrolls to latest
- **Live tier dots** (training mode only) — colored dots appear next to moves as you play:
  - Green = good move, Yellow = inaccuracy, Red = blunder
  - Shows a small notification when a non-green move is detected; can dismiss
- **Player notes** (AI games) — a text area where you can write strategy notes to yourself during the game
- **Ask Sensei** button — opens the coach chat drawer (keyboard shortcut: **C**)
- **Pass** button (enabled on your turn)
- **Undo** button (AI games only, enabled on your turn after 2+ moves)
- **Resign** button (enabled on your turn, styled in a warning color)

**When the game ends:**
- A **post-game modal** appears with result ("Black wins by 5.5"), summary of who played who, and three buttons:
  - **Review this game** → goes to the review screen
  - **Back to lobby**
  - **Play again** (AI games only)
- The panel also shows a "Game over" banner with the result and an "Open review viewer →" link

**Footer links:** Export SGF (download the game file) · Back to Lobby

#### Coach Chat Drawer
Slides in from the right when opened.

- Header: "Ask Sensei" + close button
- Loading bar animation while the AI is typing
- **First time:** three preset question buttons:
  - **What am I missing?** — the coach points out areas of the board you're ignoring (without giving away exact moves)
  - **Help me read this fight** — tactical help for a specific group or sequence
  - **What's my plan?** — big-picture strategy based on territory and influence
- **After first message:** a conversation thread (your messages + coach responses) with a text input field and **Send** button (Enter to send, Shift+Enter for new line)
- Coach responses appear word-by-word as they stream in
- Closing the drawer mid-stream stops the response

---

### 5. Game Review `/games/:gameId`

**Purpose:** Review a finished game. See where you went wrong, read the AI's commentary, and scrub through every move.

**Layout:** Board + controls on the left, tabbed panel on the right.

#### Left — Board & Timeline

- Breadcrumb: "← Games"
- Title: "Game review"
- Meta line: board size · komi · opponent · result

**Engine overlay toggles (two buttons):**
- **Top engine move** — shows a star (★) on the move the engine would have played
- **Ownership map** — colors the board to show who owns each area (warm = Black's territory, cool = White's)
- Both are greyed out until analysis has been run

**Board:** Shows the position at the currently selected move. Read-only (you scrub, not play).

**Move scrubber (timeline):**
- Buttons: ⏮ First · ◀ Back · ▶/⏸ Play/Pause · ▶ Forward · ⏭ Last
- Move counter: "45 / 127"
- Slider you can drag to jump to any move
- Keyboard: ← → to step one move, Home/End to jump to start/end, Space to play/pause

**Score chart:**
- A line chart showing Black's score lead over every move
- Upper half = Black winning, lower half = White winning
- Click anywhere on the chart to jump to that move
- Shows "Black ahead by X pts" or "Black behind by X pts"

#### Right — Three Tabs

**Tab 1: Review**
- Shows the AI-generated coaching commentary for this game
- Top section: which model generated it, when, and a **Regenerate** button
- **Game summary** — 2-sentence overall take
- **Moment cards** — one card per key moment the AI picked (usually 4):
  - Move number + type label (Blunder / Mistake / Inaccuracy)
  - Points lost + which move you played + what the engine would have played
  - A small board snapshot showing that moment
  - Step buttons to play through the main variation (◀ / ▶)
  - AI explanation (paragraph of text)
  - Concept badges (links to relevant Go concepts)
  - "Show on board →" link (jumps the main board to that move)

**Tab 2: Analysis**
- Table of every move with columns: #, stone color, move played, engine's top move, points lost, game phase
- Each row clickable (jumps board to that move)
- Red rows = blunders
- Filter checkbox: **Blunders only**
- Sort dropdown: **By move** / **By points lost**
- Click a yellow or red row → a note popover appears where you can write your own annotation for that move
- Keyboard: **j / k** to cycle through non-green (imperfect) moves
- Footer: count of moves shown + **Re-run analysis** button

If no analysis has been run yet:
- Empty state with **Run analysis** button

**Tab 3: Info**
- Static details: Game ID, board size, komi, opponent type, player IDs, result
- **Download SGF** link
- **Copy share link** button (copies URL, shows a "Link copied" toast)

---

### 6. Games List `/games`

**Purpose:** See all your past games in one place.

**What's on screen:**
- "Your games" heading + total count
- Two filters: **Status** (Any / In progress / Finished) · **Size** (Any / 9×9 / 13×13 / 19×19)
- Table with columns: Date · Size · Result · Game ID · Action link ("Review →" or "Resume →")
- Click any row to go to that game's review or live board
- Empty state: "No matches. Play one →" (link to Lobby)
- Pagination if more than 25 games (← Prev · Page X of Y · Next →)

---

### 7. Coach `/coach`

**Purpose:** Ask the planner what to work on next. This is the "session start" screen.

**What's on screen:**
- "Your coaching session" eyebrow
- "先生 Sensei" heading
- Tagline explaining what the planner does
- Button: **Start session** (or **Pick another** once a suggestion is showing)
- The planner's suggestion (see ActionCard below) with a collapsible "Why this?" section
- History of past suggestions below (kind, reason, timestamp)

---

### 8. Drill `/drill` and `/drill/:problemId`

**Purpose:** Practice Go puzzles (tsumego). The planner selects the most relevant one for your weakness profile.

**Loading state:** "Picking your next problem…"

**Active drill:**

Layout: Board on the left, sidebar on the right.

#### Left — Board
- Shows the problem position (setup stones + stones you've placed)
- Click to place your next move (Black or White depending on the problem)
- Disabled after you solve, fail, or reveal the solution

#### Right — Sidebar

- Problem themes (e.g., "Ladder · Snapback")
- "Black to play · difficulty 6"
- Difficulty: X / 10
- Step counter: move X of Y through the solution
- **Hint** button — shows the next move coordinate as a toast notification
- **Show solution** button — reveals all remaining moves on the board, marks as failed
- **Next problem →** button (appears after solved, failed, or solution shown)
- Italic note after solution shown: "The full solution is on the board. Take your time, then go to the next problem."
- **End session** button

**After solving or failing — a modal appears:**

If solved:
- "✓ Correct"
- Message: "Solved cleanly. Sensei will adjust your weakness model." (or "...with a hint — count as half-credit.")
- Buttons: **Next problem** · **Study the board** · **Study this concept**

If failed:
- "✗ Not quite"
- Message: "Dismiss this to study the position, then reveal the solution or move on."
- Buttons: **Next problem** · **Reveal solution** · **Study the board** · **Study this concept**

---

### 9. Profile `/profile` and `/profile/:userId`

**Purpose:** Your learning history. Weaknesses, games, concepts, progress.

**Header:**
- Your display name / user ID
- If viewing your own profile: inline **handle editor** (edit your display name)
- Three stats: total games · finished games · weaknesses tracked

**Four tabs:**

**Weaknesses tab:**
- Horizontal progress bars, one per tracked weakness theme
- Sorted by severity (worst first)
- Each bar shows: theme name · severity score (0–1) · "seen in X games" · "last [date]"
- Empty state if no weaknesses yet

**Game history tab:**
- Full list of your games (board size, result, date)
- Each links to review or resume

**Concepts tab:**
- Grid of concept cards you've been taught
- Each card: concept title · how many times taught · whether you've demonstrated it
- Links to concept detail page
- Empty state if no concepts taught yet

**Progress tab:**
- Three mini line charts:
  - Games per week
  - Drills per week
  - Top weakness severity over time (is your biggest weakness getting better or worse?)

---

### 10. Concepts Library `/concepts`

**Purpose:** Browse all the Go teaching concepts in the app's library.

**Layout:** Tag sidebar on the left, concept grid on the right.

**Left — Tags:**
- **All** button (shows everything)
- One button per tag (e.g., "opening", "tesuji", "endgame", "shape")
- One tag active at a time

**Right — Grid:**
- Concept cards: title + tags
- Click → goes to that concept's detail page
- Empty state if nothing matches the selected tag

---

### 11. Concept Detail `/concepts/:conceptId`

**Purpose:** Read one Go concept in full.

**What's on screen:**
- Breadcrumb: "← Library"
- Concept title (large)
- Tag chips below the title
- Full body text (formatted, may include lists, subheadings, emphasis)

---

### 12. Settings `/settings`

**Purpose:** Customize the board appearance and experience. All settings are saved on your device only.

**Three columns:**

**Column 1 — Board:**
- **Theme:** Wood (default) · Slate · Minimal (three radio options with tooltips)
- **Stone style:** Classic (3D-looking) · Flat
- **Show coordinates:** On/Off toggle (shows A–T letters and 1–19 numbers around the board)
- **Default board size:** Dropdown (9×9 / 13×13 / 19×19)

**Column 2 — Experience:**
- **Sound effects:** On/Off toggle (stone placement sounds — listed as coming soon)
- **Animations:** On/Off toggle

**Column 3 — Live Preview:**
- A small 9×9 board showing what your current theme + stone style actually looks like (non-interactive)

**Maintenance section:**
- **Reset local state** button — clears all preferences and cached data (a confirmation dialog appears first)

---

## Reusable UI Elements (Components)

These appear across multiple screens. Each is noted wherever it shows up above.

### ActionCard
Appears on the Home screen and Coach screen. Shows the planner's suggestion for what to do next.

- Large decorative kanji mark (varies by action type)
- Action type label and description
- Buttons vary by action:
  - **Review game** → game link + "Play another instead" button
  - **Do a drill** → problem name + difficulty + "Start drill" button + "Pick another" button
  - **Learn a concept** → concept name + "Open lesson" button
  - **Revisit a concept** → same as above
  - **Idle (nothing to do)** → reason text + "Find a game" button + "Open Coach" button

### WeaknessBar
Appears on Home and Profile pages. Horizontal bar showing one weakness:
- Theme name (e.g., "Blunder in opening")
- Severity as a filled bar (0–100% wide)
- Optional meta: how many games it was seen in, last seen date

### MomentCard
Appears in the Review tab. One card per key game moment:
- Move number, type label, points lost
- Move played vs. engine's suggestion
- Small board snapshot
- Navigation buttons to step through the correct variation
- AI explanation text
- Concept badges (links to concept detail pages)
- "Show on board →" link

### ScoreLineChart
Appears in the Game Review screen. Line chart of score advantage over the whole game.

### Sparkline
Tiny version of a line chart. Used in the Progress tab on Profile.

### UserChip
Small inline user identifier (name + stone color). Appears in the game panel.

### TierDot
Colored dot (green / yellow / red) next to a move in the analysis view.

### Toast Notifications
Small pop-up in the top-right corner. Used for: "Link copied", hint coordinates, errors. Auto-dismisses.

---

## What the Backend Provides (Capabilities Available to Design Around)

Everything listed here is real and already built. If you design a feature that maps to one of these, it can be implemented.

| Capability | What it means for the product |
|---|---|
| **Play a game vs AI** | The AI makes moves, adjusts its strength to a chosen rank |
| **AI rank slider** | AI can be set from 4-dan (very strong) to 20-kyu (beginner) |
| **Training mode** | During play, each move is scored live and colored green/yellow/red |
| **Play vs Human** | Two humans share a game ID and play against each other |
| **Game analysis (KataGo)** | Every move scored: what you played vs. what the engine would play, how many points you lost |
| **Full game review (LLM)** | AI writes a coaching summary + explanations for the 4 most important moments |
| **Single-move notes (LLM)** | AI writes 80–120 words about one specific move, labels it as a blunder/mistake/suboptimal/good |
| **Coach chat (streaming)** | Real-time Socratic conversation during a game: 4 question modes, context-aware, streams word by word |
| **Weakness tracking** | 6 types of habit tracked across games, updated after every game using a running average |
| **Planner** | Deterministic system that decides: review game / learn concept / revisit concept / do drill / idle |
| **Drill (tsumego) picker** | Selects the next puzzle based on your weaknesses and current level |
| **Concept library** | Written Go concepts with tags; each linked to weakness themes |
| **Concept teaching tracking** | Records when a concept was taught, how many times, whether you demonstrated it |
| **User profile** | Weakness history, game history, concepts taught, weekly progress stats |
| **Rank estimation** | System estimates your rank from game performance; feeds into coach tone (beginner/intermediate/expert) |
| **SGF export** | Download the game record in standard format |
| **Session continuity** | Coach chat persists across multiple messages within a game session |
| **Google sign-in + magic link + password** | Three auth methods |
| **Board themes** | Three visual board themes (stored as user preference) |

---

## Current Visual Style (To Be Replaced by Your Design)

The current implementation uses:
- A Japanese-inspired aesthetic: kanji marks as decorative elements (先, 碁, 師, 智, 析, 評, 練, 復, 閑)
- A warm wood-toned board as the default
- Ink/seal color palette (dark reds, near-blacks, warm off-whites)
- Monospace font for game data (moves, IDs, coordinates)
- Sans-serif for body text
- Minimal use of color: mostly monochrome with green/yellow/red for move quality tiers

All of this is yours to redesign. The layout (two-column game view, tabbed review panel, etc.) can also be restructured — these are just current technical choices, not requirements.

---

## Current User Flows (How Screens Connect)

```
Sign in
  └─ Lobby
       ├─ Create game vs AI ──────→ Live game board
       │                                  │
       │                         [game ends]
       │                                  │
       │                         Post-game modal
       │                           ├─ Review this game ──→ Game review
       │                           ├─ Back to lobby ──────→ Lobby
       │                           └─ Play again ─────────→ Live game board
       │
       ├─ Create game vs Human ───→ Live game board (same as above)
       │
       └─ Join game by ID ────────→ Live game board (same as above)


Home
  ├─ "What should I do next?" ───→ ActionCard appears
  │      ├─ Review game ─────────→ Game review
  │      ├─ Start drill ─────────→ Drill
  │      └─ Open lesson ─────────→ Concept detail
  ├─ "View all →" ───────────────→ Games list
  ├─ "Full profile →" ───────────→ Profile
  └─ "See progress →" ───────────→ Profile (progress tab)


Coach
  └─ "Start session" ────────────→ ActionCard (same options as Home)


Games list
  ├─ Finished game row ──────────→ Game review
  └─ In-progress game row ───────→ Live game board


Game review
  ├─ Concept badge ──────────────→ Concept detail
  ├─ "Show on board →" ──────────→ (jumps board within the same screen)
  └─ Moment card click ──────────→ (jumps board within the same screen)


Drill
  ├─ "Study this concept" ───────→ Concept detail
  └─ "Next problem" ─────────────→ Next drill (same screen, new problem)


Concepts library
  └─ Concept card ───────────────→ Concept detail


Profile
  ├─ Concepts tab → concept card → Concept detail
  └─ Game history tab → game row → Game review or Live game
```

---

## Screens Not Yet Built (Mentioned / Planned)

- **Opponent profile during live game** — currently no way to view your opponent's profile mid-game
- **Game chat between human players** — no messaging during human vs. human games
- **Concept demonstration tracking** — the backend tracks whether you demonstrated a concept, but there's no UI to mark it
- **Multi-device settings sync** — currently localStorage only
- **Sound effects** — toggle exists but assets not wired up
- **Feedback on reviews** — "Helpful / Not helpful" thumbs mentioned in review tab, not implemented
- **Eval / results tracking** — planner records history but no visualization of how suggestions affected your weakness over time
