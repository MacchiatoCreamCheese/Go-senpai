from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app import db


@pytest.fixture(autouse=True)
def mock_db():
    """Override global DB autouse patch for direct app.db query-shape tests."""
    yield


class _FakePool:
    def __init__(self):
        self.last_fetchrow_query: str | None = None
        self.last_fetch_query: str | None = None

    async def fetchrow(self, query: str, *args):
        self.last_fetchrow_query = query
        return {
            "id": "11111111-1111-1111-1111-111111111111",
            "user_id": "00000000-0000-0000-0000-000000000001",
            "started_at": datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc),
            "finished_at": None,
            "status": "active",
            "problem_count": 0,
            "target_problem_count": 5,
            "attempt_count": 2,
            "correct_count": 1,
        }

    async def fetch(self, query: str, *args):
        self.last_fetch_query = query
        return [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "user_id": "00000000-0000-0000-0000-000000000001",
                "started_at": datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc),
                "finished_at": None,
                "status": "active",
                "problem_count": 0,
                "target_problem_count": 5,
                "attempt_count": 2,
                "correct_count": 1,
            }
        ]


def test_get_drill_session_query_excludes_retry_attempts(monkeypatch):
    pool = _FakePool()
    monkeypatch.setattr(db, "_get_pool", lambda: pool)

    row = asyncio.run(db.get_drill_session("11111111-1111-1111-1111-111111111111"))

    assert row is not None
    assert pool.last_fetchrow_query is not None
    assert "NOT COALESCE(a.is_retry, FALSE)" in pool.last_fetchrow_query


def test_list_drill_sessions_query_excludes_retry_attempts(monkeypatch):
    pool = _FakePool()
    monkeypatch.setattr(db, "_get_pool", lambda: pool)

    rows = asyncio.run(db.list_drill_sessions("00000000-0000-0000-0000-000000000001"))

    assert len(rows) == 1
    assert pool.last_fetch_query is not None
    assert "NOT COALESCE(a.is_retry, FALSE)" in pool.last_fetch_query
