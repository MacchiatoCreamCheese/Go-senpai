from __future__ import annotations

import asyncio
import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path

from .... import db
from ..retriever import embed_text


CONCEPTS_DIR = Path(__file__).parent / "concepts"

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


@dataclass
class ConceptFile:
    id: str
    title: str
    tags: list[str]
    body_md: str
    body_hash: str


def parse_concept_file(path: Path) -> ConceptFile:
    text = path.read_text(encoding="utf-8")
    match = _FRONTMATTER_RE.match(text)
    if not match:
        raise ValueError(f"missing frontmatter in {path}")
    fm_raw, body = match.group(1), match.group(2).strip()

    fm: dict[str, object] = {}
    for line in fm_raw.splitlines():
        if not line.strip() or ":" not in line:
            continue
        key, _, value = line.partition(":")
        fm[key.strip()] = value.strip()

    concept_id = str(fm.get("id") or path.stem)
    title = str(fm.get("title") or concept_id.replace("_", " ").title())
    tags_raw = str(fm.get("tags") or "")
    tags = _parse_list(tags_raw)

    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return ConceptFile(
        id=concept_id,
        title=title,
        tags=tags,
        body_md=body,
        body_hash=body_hash,
    )


def _parse_list(raw: str) -> list[str]:
    raw = raw.strip()
    if not raw:
        return []
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    return [item.strip().strip('"').strip("'") for item in raw.split(",") if item.strip()]


def discover_concepts(directory: Path = CONCEPTS_DIR) -> list[ConceptFile]:
    if not directory.exists():
        return []
    return [parse_concept_file(p) for p in sorted(directory.glob("*.md"))]


async def ingest(directory: Path = CONCEPTS_DIR) -> dict[str, int]:
    """Embed and upsert concepts whose body has changed. Returns counts."""
    concepts = discover_concepts(directory)
    existing = await db.get_concept_hashes()
    stats = {"total": len(concepts), "embedded": 0, "skipped": 0}
    for c in concepts:
        if existing.get(c.id) == c.body_hash:
            stats["skipped"] += 1
            continue
        # Embed title + body so retrieval matches on both.
        vector = await embed_text(f"{c.title}\n\n{c.body_md}")
        await db.upsert_concept(
            concept_id=c.id,
            title=c.title,
            tags=c.tags,
            body_md=c.body_md,
            body_hash=c.body_hash,
            embedding=vector,
        )
        stats["embedded"] += 1
    return stats


async def _main() -> None:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[4] / ".env")
    load_dotenv()  # fallback: cwd or already-set env
    dsn = os.environ["DATABASE_URL"]
    await db.connect(dsn)
    try:
        stats = await ingest()
        print(f"concepts: {stats}")
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(_main())
