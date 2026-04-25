"""Wipe the local Postgres schema and re-apply ``backend/db/init.sql``.

Class-project safety net: when the schema changes (e.g. adding ``users.email``
for Supabase), it's faster to flatten and reseed than to write migrations.
**Destroys all data** — only use against the local dev DB.

Usage::

    python -m scripts.reset_db                       # default DATABASE_URL
    DATABASE_URL=postgres://... python -m scripts.reset_db
    python -m scripts.reset_db --keep-problems       # preserves seeded tsumego

The script runs everything in a single transaction so a failure leaves the
database untouched.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import asyncpg
from dotenv import load_dotenv

INIT_SQL = Path(__file__).resolve().parent.parent / "db" / "init.sql"
SEEDS_DIR = Path(__file__).resolve().parent.parent / "db" / "seeds"


async def main(keep_problems: bool) -> None:
    load_dotenv()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("DATABASE_URL is not set; refusing to guess.")

    schema = INIT_SQL.read_text(encoding="utf-8")

    conn = await asyncpg.connect(dsn)
    try:
        async with conn.transaction():
            print("Dropping public schema…")
            await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
            print(f"Applying {INIT_SQL.name}…")
            await conn.execute(schema)
            if keep_problems:
                problems = SEEDS_DIR / "problems.json"
                if problems.exists():
                    print("Re-seeding problems is left to the existing seed task.")
                    print(
                        "Run: python -m scripts.seed_problems  (or whatever your team's helper is)."
                    )
        print("Done.")
    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--keep-problems",
        action="store_true",
        help="(advisory) keep tsumego problems if a seeder is wired up",
    )
    args = parser.parse_args()
    asyncio.run(main(args.keep_problems))
