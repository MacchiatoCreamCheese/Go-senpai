from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

_USER_ID = "00000000-0000-0000-0000-000000000001"


def _problem(pid="p1", themes=("tesuji",), difficulty=1):
    return {
        "id": pid,
        "sgf": "(;FF[4]GM[1]SZ[9])",
        "solution": [{"color": "B", "coord": "D4"}],
        "themes": list(themes),
        "difficulty": difficulty,
        "source": "test",
    }


def test_next_problem_returns_a_problem():
    client = TestClient(app)
    with patch(
        "app.db.list_user_weaknesses",
        new=AsyncMock(return_value=[{"theme": "ignored_top_move", "severity": 0.5}]),
    ), patch(
        "app.db.list_candidate_problems",
        new=AsyncMock(return_value=[_problem("p1", ("tesuji",))]),
    ), patch(
        "app.db.recent_problem_ids", new=AsyncMock(return_value=[])
    ):
        resp = client.get(f"/api/users/{_USER_ID}/next-problem")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "p1"
    assert body["themes"] == ["tesuji"]


def test_next_problem_404_when_db_empty():
    client = TestClient(app)
    with patch(
        "app.db.list_user_weaknesses", new=AsyncMock(return_value=[])
    ), patch(
        "app.db.list_candidate_problems", new=AsyncMock(return_value=[])
    ), patch(
        "app.db.recent_problem_ids", new=AsyncMock(return_value=[])
    ):
        resp = client.get(f"/api/users/{_USER_ID}/next-problem")
    assert resp.status_code == 404


def test_drill_attempt_insert_returns_201():
    client = TestClient(app)
    row = {
        "id": 42,
        "user_id": _USER_ID,
        "problem_id": "p1",
        "attempted_at": datetime(2026, 4, 25, 12, 0, tzinfo=timezone.utc),
        "success": True,
    }
    with patch("app.db.record_drill_attempt", new=AsyncMock(return_value=row)):
        resp = client.post(
            "/api/drill-attempts",
            json={
                "user_id": _USER_ID,
                "problem_id": "p1",
                "success": True,
                "moves_played": [],
                "hint_used": False,
            },
        )
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] == 42
    assert body["success"] is True
