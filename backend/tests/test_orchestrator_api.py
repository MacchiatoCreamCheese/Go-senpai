from __future__ import annotations

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


def test_next_action_review_game_branch():
    client = TestClient(app)
    with patch(
        "app.db.list_unreviewed_games_for_user",
        new=AsyncMock(return_value=[{"id": "11111111-1111-1111-1111-111111111111"}]),
    ):
        resp = client.post(f"/api/users/{_USER_ID}/next-action")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "review_game"
    assert body["game_id"] == "11111111-1111-1111-1111-111111111111"


def test_next_action_teach_concept_branch():
    client = TestClient(app)
    concept = {
        "id": "shape_fundamentals",
        "title": "Shape fundamentals",
        "body_md": "good shape is...",
        "tags": ["shape"],
    }
    with patch(
        "app.db.list_user_weaknesses",
        new=AsyncMock(return_value=[{"theme": "ignored_top_move", "severity": 0.5}]),
    ), patch(
        "app.db.list_candidate_problems",
        new=AsyncMock(return_value=[_problem()]),
    ), patch(
        "app.db.get_concept", new=AsyncMock(return_value=concept)
    ), patch(
        "app.db.record_concept_taught", new=AsyncMock(return_value=None)
    ):
        resp = client.post(f"/api/users/{_USER_ID}/next-action")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "teach_concept"
    assert body["concept"]["id"] == "shape_fundamentals"


def test_next_action_serve_drill_branch():
    client = TestClient(app)
    with patch(
        "app.db.list_candidate_problems",
        new=AsyncMock(return_value=[_problem("d1", ("tesuji",))]),
    ):
        resp = client.post(f"/api/users/{_USER_ID}/next-action")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "serve_drill"
    assert body["problem"]["id"] == "d1"


def test_next_action_idle_when_nothing_to_do():
    client = TestClient(app)
    # Autouse stubs already return empty for unreviewed/weaknesses/candidates.
    resp = client.post(f"/api/users/{_USER_ID}/next-action")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "idle"
