from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from ... import db
from .selector import Moment


DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
TOP_K_PER_MOMENT = 3


@dataclass
class RetrievedConcept:
    id: str
    title: str
    body_md: str


def _model_name() -> str:
    return os.environ.get("REVIEW_EMBEDDING_MODEL", DEFAULT_MODEL)


@lru_cache(maxsize=1)
def _get_model() -> Any:
    from sentence_transformers import SentenceTransformer  # heavy; lazy import

    return SentenceTransformer(_model_name())


def _embed_sync(text: str) -> list[float]:
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return [float(x) for x in vec.tolist()]


async def embed_text(text: str) -> list[float]:
    return await asyncio.to_thread(_embed_sync, text)


def moment_query_text(moment: Moment) -> str:
    """Build a retrieval query from a moment's structured features.

    The query is phrased in Go-reviewer vocabulary so it aligns with the
    corpus concept texts (shape/tactics/strategy terms).
    """
    parts = [
        f"{moment.phase} {moment.kind}",
        f"player lost {moment.points_lost:.1f} points",
    ]
    if moment.top_move and moment.top_move.lower() not in ("pass", "resign"):
        parts.append(f"played {moment.coord} instead of {moment.top_move}")
    if moment.winrate_before is not None and moment.winrate_after is not None:
        delta = (moment.winrate_before - moment.winrate_after) * 100
        parts.append(f"winrate dropped {delta:.0f} percent")
    if moment.phase == "opening":
        parts.append("opening principles corner side center direction of play")
    elif moment.phase == "middlegame":
        parts.append("middlegame shape tesuji fighting thickness")
    else:
        parts.append("endgame sente gote life and death")
    return ", ".join(parts)


async def retrieve_for_moment(
    moment: Moment, *, limit: int = TOP_K_PER_MOMENT
) -> list[RetrievedConcept]:
    query = moment_query_text(moment)
    embedding = await embed_text(query)
    rows = await db.retrieve_concepts_by_vector(embedding, limit=limit)
    return [RetrievedConcept(id=r["id"], title=r["title"], body_md=r["body_md"]) for r in rows]


async def retrieve_for_moments(
    moments: list[Moment], *, limit: int = TOP_K_PER_MOMENT
) -> list[list[RetrievedConcept]]:
    return await asyncio.gather(*(retrieve_for_moment(m, limit=limit) for m in moments))
