# Go-senpai backend

FastAPI server for the Sensei Go coaching platform. Full feature set is implemented: game engine, KataGo analysis pipeline, weakness detection, LLM review, SSE coaching chat, agentic orchestrator, and drill selector.

---

## Prerequisites

- **Python 3.11+**
- **KataGo** + a network file (optional — only needed if you want to run move analysis)

---

## 1. Install KataGo (one-time, only for analysis)

KataGo runs on the **host**, not in Docker (needs GPU access on Windows).

1. Download a Windows OpenCL release from <https://github.com/lightvector/KataGo/releases>, e.g. `katago-v1.16.4-opencl-windows-x64.zip`.
2. Create `C:\tools\katago\` and unzip the archive contents into it. You should now have `C:\tools\katago\katago.exe` plus several `.cfg` files.
3. Download a network file from <https://katagotraining.org/networks/>. Recommended: `kata1-b28c512nbt-s12763923712-d5805955894.bin.gz`. Save into `C:\tools\katago\` (do **not** unzip).
4. Duplicate `analysis_example.cfg` → `analysis.cfg` in the same folder. Edit `analysis.cfg`:
   ```
   numAnalysisThreads = 1
   numSearchThreadsPerAnalysisThread = 1
   maxVisits = 500
   ```
   (`numSearchThreadsPerAnalysisThread = 1` makes results reproducible — required for the position-hash cache to be meaningful.)
5. First run tunes OpenCL (~5 min, one-time):
   ```powershell
   C:\tools\katago\katago.exe analysis -config C:\tools\katago\analysis.cfg -model C:\tools\katago\kata1-b28c512nbt-s12763923712-d5805955894.bin.gz < NUL
   ```
   Wait until it prints `Started, ready to begin handling requests`, then Ctrl+C.

---

## 2. Database

The project uses a shared Supabase database — no Docker needed.

Get the `DATABASE_URL` from a teammate. It looks like:
```
postgresql://postgres.vrsogktirpdmbkjvyxky:[YOUR-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

> **Password has special characters?** (`@`, `#`, `[`, `]`, etc.) Percent-encode it first:
> ```python
> from urllib.parse import quote_plus; print(quote_plus("your_password"))
> ```
> Use the output in place of `[YOUR-PASSWORD]`.

**First-time schema setup** (only needs to be done once for the whole team):
1. Open Supabase Dashboard → SQL Editor
2. Paste the full contents of `backend/db/init.sql` and run it

---

## 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL` to the Supabase connection string from step 2. Everything else defaults to sensible values (`KATAGO_ENABLED=false`, no LLM keys required to run the server).

To enable KataGo analysis:
```
KATAGO_ENABLED=true
KATAGO_BIN=C:\tools\katago\katago.exe
KATAGO_CONFIG=C:\tools\katago\analysis.cfg
KATAGO_MODEL=C:\tools\katago\kata1-b28c512nbt-s12763923712-d5805955894.bin.gz
KATAGO_MAX_VISITS=500
KATAGO_RULES=chinese
```

---

## 4. Install dependencies and run tests

```bash
pip install -e ".[dev]"
pytest -q
```
Expect 41 passed.

---

## 5. Seed the database

Run once (safe to re-run — both commands upsert):

```bash
python scripts/load_problems.py                 # tsumego problems
python -m app.services.review.corpus.loader     # Go concepts + embeddings
```

---

## 6. Run the server

```bash
uvicorn app.main:app --reload
```

If `KATAGO_ENABLED=true`, the KataGo subprocess is launched at app startup and terminated on shutdown. The first analysis request after launch may take a few extra seconds while KataGo loads the network.

---

## 7. Verify end-to-end

In another terminal (or via the frontend, which is easier):

```bash
# create a user
curl -X POST localhost:8000/api/users -H "Content-Type: application/json" -d '{"handle":"me"}'
# → { "id": "<USER_ID>", ... }

# create a 9x9 game vs AI
curl -X POST localhost:8000/api/games -H "Content-Type: application/json" \
  -d '{"size":9,"komi":5.5,"user_id":"<USER_ID>","color":"B","opponent_type":"ai","ai_rank":20}'
# → { "id": "<GAME_ID>", ... }
```

Play ~15 moves via the frontend, then resign as one side.

```bash
# run analysis
curl -X POST localhost:8000/api/games/<GAME_ID>/analyze
# → { "move_count": 15, "visits": 500, "katago_version": "...", "cached": false }

# fetch features
curl localhost:8000/api/games/<GAME_ID>/analysis
# → { "features": [ { "move_number": 1, "points_lost": 0.4, ... }, ... ] }
```

Re-running `/analyze` returns `"cached": true` instantly. Add `?force=true` to re-analyze.

**Optional spot-check:** download the SGF (`GET /api/games/<GAME_ID>/sgf`), open it in [KaTrain](https://github.com/sanderland/katrain) with the same model + 500 visits + single thread, and confirm `points_lost` and `top_move` match within ~0.3 pts on a few moves.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `503 KataGo engine is not running` from `/analyze` | `KATAGO_ENABLED=false`, wrong path in `.env`, or the binary crashed at startup. Check uvicorn stderr for KataGo's error lines. |
| `400 game is not finished` | Game has no `ended_at`. Resign or play to two passes first. |
| First `/analyze` is slow | Normal — KataGo loads the network into VRAM on first request. |
| `points_lost` differs run-to-run by ±0.5 | `numSearchThreadsPerAnalysisThread > 1` in `analysis.cfg`. Set it to 1. |
| `relation "move_features" does not exist` | Schema is out of date. Re-run `backend/db/init.sql` in the Supabase SQL Editor. |
| First KataGo run hangs for several minutes | OpenCL auto-tuning. One-time; let it finish. |

---

## Phase 1 endpoints (added in this phase)

- `POST /api/games/{id}/analyze[?force=true]` — run KataGo over a finished game and persist per-move features. Idempotent unless `force=true`.
- `GET /api/games/{id}/analysis` — return persisted features.

Schema additions: `move_features`, `position_analyses` (see `db/init.sql`).
