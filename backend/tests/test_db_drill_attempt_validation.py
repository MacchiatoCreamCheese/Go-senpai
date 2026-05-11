from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app import db


_USER_ID = "00000000-0000-0000-0000-000000000001"
_SESSION_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(autouse=True)
def mock_db():
    """Override global autouse DB patching so this module can unit-test app.db directly."""
    yield


class _FakePool:
    def __init__(self):
        self.insert_called = False
        self._calls = 0

    async def fetchrow(self, query: str, *args):
        self._calls += 1
        if "INSERT INTO drill_attempts" in query:
            self.insert_called = True
            return {
                "id": 123,
                "user_id": _USER_ID,
                "problem_id": "p-001",
                "attempted_at": datetime(2026, 5, 11, 12, 0, tzinfo=timezone.utc),
                "success": False,
                "session_id": _SESSION_ID,
                "is_retry": True,
                "retry_of_attempt_id": 122,
            }
        if self._calls == 1:
            return {"user_id": _USER_ID, "status": "active"}
        if self._calls == 2:
            return {"user_id": _USER_ID, "problem_id": "p-001", "session_id": _SESSION_ID}
        raise AssertionError(f"Unexpected query order call={self._calls}: {query}")


def test_record_drill_attempt_allows_valid_retry_same_session(monkeypatch):
    pool = _FakePool()
    monkeypatch.setattr(db, "_get_pool", lambda: pool)

    row = asyncio.run(
        db.record_drill_attempt(
            user_id=_USER_ID,
            problem_id="p-001",
            success=False,
            moves_played=[],
            hint_used=False,
            session_id=_SESSION_ID,
            is_retry=True,
            retry_of_attempt_id=122,
        )
    )

    assert pool.insert_called is True
    assert row["id"] == 123
    assert row["is_retry"] is True
    assert row["retry_of_attempt_id"] == 122
