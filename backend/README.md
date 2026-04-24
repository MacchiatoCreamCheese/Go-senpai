# Go-senpai backend

FastAPI server for the Sensei Go coaching platform. Phase 0 (persistence) and Phase 1 (KataGo feature pipeline) are implemented.

---

## Prerequisites

- **Python 3.11+**
- **Docker Desktop** (for Postgres)
- **KataGo** + a network file (only required if you want to run analysis; the server runs without it)

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

## 2. Start Postgres

From the repo root:
```bash
docker compose up -d db
```
The schema in `backend/db/init.sql` is applied automatically on first creation. **If you pull updates that change the schema, recreate the volume:**
```bash
docker compose down -v && docker compose up -d db
```

---

## 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`. Minimum to run the server (no analysis):
```
DATABASE_URL=postgresql://senpai:senpai@localhost:5432/senpai
KATAGO_ENABLED=false
```

To enable analysis (Phase 1):
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

## 5. Run the server

```bash
uvicorn app.main:app --reload
```

If `KATAGO_ENABLED=true`, the KataGo subprocess is launched at app startup and terminated on shutdown. The first analysis request after launch may take a few extra seconds while KataGo loads the network.

---

## 6. Verify Phase 1 end-to-end

In another terminal (or via the frontend, which is easier):

```bash
# create a user
curl -X POST localhost:8000/api/users -H "Content-Type: application/json" -d '{"handle":"me"}'
# → { "id": "<USER_ID>", ... }

# create a 9x9 game (use the same id for both seats for solo testing)
curl -X POST localhost:8000/api/games -H "Content-Type: application/json" \
  -d '{"size":9,"komi":5.5,"black_user_id":"<USER_ID>","white_user_id":"<USER_ID>"}'
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
| `relation "move_features" does not exist` | Schema is out of date. `docker compose down -v && docker compose up -d db`. |
| First KataGo run hangs for several minutes | OpenCL auto-tuning. One-time; let it finish. |

---

## Phase 1 endpoints (added in this phase)

- `POST /api/games/{id}/analyze[?force=true]` — run KataGo over a finished game and persist per-move features. Idempotent unless `force=true`.
- `GET /api/games/{id}/analysis` — return persisted features.

Schema additions: `move_features`, `position_analyses` (see `db/init.sql`).
