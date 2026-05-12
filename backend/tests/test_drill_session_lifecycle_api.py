from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.api.auth import soft_user
from app.main import app


_USER_ID = "00000000-0000-0000-0000-000000000001"
_OTHER_USER_ID = "00000000-0000-0000-0000-0000000000ff"


def _session_row(session_id: str = "11111111-1111-1111-1111-111111111111"):
    return {
        "id": session_id,
        "user_id": _USER_ID,
        "started_at": datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        "finished_at": None,
        "status": "active",
        "problem_count": 0,
        "attempt_count": 0,
        "correct_count": 0,
        "target_problem_count": 5,
    }


def _attempt_row():
    return {
        "id": 101,
        "user_id": _USER_ID,
        "problem_id": "p-001",
        "attempted_at": datetime(2026, 5, 1, 12, 5, tzinfo=timezone.utc),
        "success": False,
        "session_id": "11111111-1111-1111-1111-111111111111",
        "is_retry": True,
        "retry_of_attempt_id": 99,
    }


def test_delete_drill_session_legacy_mode_passes_empty_owner():
    client = TestClient(app)
    with patch("app.db.delete_drill_session", new=AsyncMock(return_value=True)) as m_delete:
        resp = client.delete("/api/drill-sessions/11111111-1111-1111-1111-111111111111")

    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}
    m_delete.assert_awaited_once_with("11111111-1111-1111-1111-111111111111", "")


def test_delete_drill_session_auth_mode_uses_authenticated_owner():
    client = TestClient(app)
    app.dependency_overrides[soft_user] = lambda: {"id": _USER_ID}
    try:
        with patch("app.db.delete_drill_session", new=AsyncMock(return_value=True)) as m_delete:
            resp = client.delete("/api/drill-sessions/11111111-1111-1111-1111-111111111111")
        assert resp.status_code == 200
        m_delete.assert_awaited_once_with("11111111-1111-1111-1111-111111111111", _USER_ID)
    finally:
        app.dependency_overrides[soft_user] = lambda: None


def test_create_drill_session_rejects_mismatched_authenticated_user():
    client = TestClient(app)
    app.dependency_overrides[soft_user] = lambda: {"id": _USER_ID}
    try:
        resp = client.post(
            "/api/drill-sessions",
            json={"user_id": _OTHER_USER_ID, "target_problem_count": 5},
        )
    finally:
        app.dependency_overrides[soft_user] = lambda: None

    assert resp.status_code == 403
    assert "does not match" in resp.json()["detail"]


def test_create_drill_attempt_rejects_invalid_retry_payload():
    client = TestClient(app)
    with patch(
        "app.db.record_drill_attempt",
        new=AsyncMock(side_effect=ValueError("retry_of_attempt_id required when is_retry is true")),
    ):
        resp = client.post(
            "/api/drill-attempts",
            json={
                "user_id": _USER_ID,
                "problem_id": "p-001",
                "success": False,
                "moves_played": [],
                "hint_used": False,
                "session_id": "11111111-1111-1111-1111-111111111111",
                "is_retry": True,
                "retry_of_attempt_id": None,
            },
        )

    assert resp.status_code == 400
    assert "retry_of_attempt_id required" in resp.json()["detail"]


def test_create_drill_attempt_returns_retry_fields():
    client = TestClient(app)
    with patch("app.db.record_drill_attempt", new=AsyncMock(return_value=_attempt_row())):
        resp = client.post(
            "/api/drill-attempts",
            json={
                "user_id": _USER_ID,
                "problem_id": "p-001",
                "success": False,
                "moves_played": [],
                "hint_used": False,
                "session_id": "11111111-1111-1111-1111-111111111111",
                "is_retry": True,
                "retry_of_attempt_id": 99,
            },
        )

    assert resp.status_code == 201
    body = resp.json()
    assert body["is_retry"] is True
    assert body["retry_of_attempt_id"] == 99


def test_finish_drill_session_scopes_to_authenticated_user():
    client = TestClient(app)
    app.dependency_overrides[soft_user] = lambda: {"id": _USER_ID}
    try:
        with patch("app.db.finish_drill_session", new=AsyncMock(return_value=_session_row())) as m_finish, patch(
            "app.db.get_drill_session",
            new=AsyncMock(return_value=_session_row()),
        ) as m_get:
            resp = client.post("/api/drill-sessions/11111111-1111-1111-1111-111111111111/finish")

        assert resp.status_code == 200
        m_finish.assert_awaited_once_with("11111111-1111-1111-1111-111111111111", _USER_ID)
        m_get.assert_awaited_once_with("11111111-1111-1111-1111-111111111111", _USER_ID)
    finally:
        app.dependency_overrides[soft_user] = lambda: None
