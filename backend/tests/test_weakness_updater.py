from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from app.services.weakness.extractor import ThemeEvidence
from app.services.weakness.updater import EMA_ALPHA, apply_evidence


def test_apply_evidence_first_time_upserts_each_theme():
    evidence = [
        ThemeEvidence("blunder_middlegame", 0.25, 2),
        ThemeEvidence("ignored_top_move", 0.10, 1),
    ]
    with patch("app.db.mark_game_processed_for_weakness", new=AsyncMock(return_value=True)) as mark, \
         patch("app.db.upsert_user_weakness", new=AsyncMock(return_value=None)) as upsert:
        applied = asyncio.run(apply_evidence("u1", "g1", evidence))

    assert applied is True
    mark.assert_awaited_once_with("u1", "g1")
    assert upsert.await_count == 2
    assert upsert.await_args_list[0].args == ("u1", "blunder_middlegame", 0.25, EMA_ALPHA)
    assert upsert.await_args_list[1].args == ("u1", "ignored_top_move", 0.10, EMA_ALPHA)


def test_apply_evidence_second_call_is_noop():
    evidence = [ThemeEvidence("blunder_middlegame", 0.25, 2)]
    with patch("app.db.mark_game_processed_for_weakness", new=AsyncMock(return_value=False)) as mark, \
         patch("app.db.upsert_user_weakness", new=AsyncMock(return_value=None)) as upsert:
        applied = asyncio.run(apply_evidence("u1", "g1", evidence))

    assert applied is False
    mark.assert_awaited_once_with("u1", "g1")
    upsert.assert_not_awaited()
