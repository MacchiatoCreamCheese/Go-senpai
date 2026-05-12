"""Apply extracted weakness evidence to the persistent user_weaknesses table.

Idempotent per (user_id, game_id): a second call for the same pair is a no-op,
so re-running /analyze doesn't double-count.
"""

from __future__ import annotations

import logging

from ... import db
from .extractor import ThemeEvidence

log = logging.getLogger(__name__)

EMA_ALPHA = 0.3


async def apply_evidence(
    user_id: str,
    game_id: str,
    evidence: list[ThemeEvidence],
) -> bool:
    """Update EMA severity for each theme; record the (user, game) as processed.

    Returns True if evidence was applied, False if already processed.
    """
    first_time = await db.mark_game_processed_for_weakness(user_id, game_id)
    if not first_time:
        log.debug("weakness evidence already applied for user=%s game=%s", user_id, game_id)
        return False

    for ev in evidence:
        await db.upsert_user_weakness(user_id, ev.theme, ev.score, EMA_ALPHA, ev.insight)
    log.info(
        "weakness update user=%s game=%s themes=%d",
        user_id,
        game_id,
        len(evidence),
    )
    return True
