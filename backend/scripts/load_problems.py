"""Upsert the tsumego seed corpus from db/seeds/problems/ into the `problems` table.

Reads `problems.json` (manifest of themes/difficulty/source/solution) and pairs
each entry with an SGF file of the same id. Re-runnable.

Usage: python backend/scripts/load_problems.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

# Allow running as `python backend/scripts/load_problems.py` from the repo root.
_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

from app import db  # noqa: E402


SEEDS_DIR = _BACKEND / "db" / "seeds"
SGF_DIR = SEEDS_DIR / "problems"
MANIFEST = SEEDS_DIR / "problems.json"


async def main() -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL not set; aborting.", file=sys.stderr)
        sys.exit(1)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    await db.connect(dsn)
    try:
        loaded = 0
        for pid, meta in manifest.items():
            sgf_path = SGF_DIR / f"{pid}.sgf"
            if not sgf_path.exists():
                print(f"  skipping {pid}: no SGF file at {sgf_path}", file=sys.stderr)
                continue
            sgf = sgf_path.read_text(encoding="utf-8")
            await db.upsert_problem(
                problem_id=pid,
                sgf=sgf,
                solution=meta["solution"],
                themes=list(meta.get("themes", [])),
                difficulty=int(meta["difficulty"]),
                source=meta.get("source"),
            )
            loaded += 1
        print(f"loaded {loaded} problems")
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
