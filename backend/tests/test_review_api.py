from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import UUID

from fastapi.testclient import TestClient

from app.main import app


_GAME_ID = "11111111-1111-1111-1111-111111111111"
_USER_ID = "00000000-0000-0000-0000-000000000001"


def _stored_row():
    return {
        "id": UUID("22222222-2222-2222-2222-222222222222"),
        "game_id": UUID(_GAME_ID),
        "for_user_id": UUID(_USER_ID),
        "generated_at": datetime.now(tz=timezone.utc),
        "model": "claude-haiku-4-5",
        "summary_md": "Two-sentence summary.",
        "moments": [
            {
                "move_number": 47,
                "coord": "K10",
                "color": "B",
                "top_move": "Q5",
                "points_lost": 8.2,
                "phase": "middlegame",
                "kind": "blunder",
                "explanation_md": "Because of direction of play, Q5 was stronger.",
                "concept_ids": ["direction_of_play"],
            }
        ],
        "cost_tokens": 1200,
    }


def test_post_review_returns_409_when_already_exists():
    with patch("app.db.get_review", new=AsyncMock(return_value=_stored_row())):
        client = TestClient(app)
        resp = client.post(f"/api/games/{_GAME_ID}/review", params={"for_user_id": _USER_ID})
    assert resp.status_code == 409


def test_post_review_generates_and_returns_payload():
    with patch(
        "app.db.get_review", new=AsyncMock(return_value=None)
    ), patch(
        "app.api.review.generate_review", new=AsyncMock(return_value=_stored_row())
    ):
        client = TestClient(app)
        resp = client.post(f"/api/games/{_GAME_ID}/review", params={"for_user_id": _USER_ID})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary_md"] == "Two-sentence summary."
    assert body["moments"][0]["move_number"] == 47
    assert body["moments"][0]["concept_ids"] == ["direction_of_play"]
    assert body["model"] == "claude-haiku-4-5"


def test_post_review_with_force_regenerates():
    with patch(
        "app.db.get_review", new=AsyncMock(return_value=_stored_row())
    ), patch(
        "app.api.review.generate_review", new=AsyncMock(return_value=_stored_row())
    ) as gen:
        client = TestClient(app)
        resp = client.post(
            f"/api/games/{_GAME_ID}/review",
            params={"for_user_id": _USER_ID, "force": "true"},
        )
    assert resp.status_code == 200
    gen.assert_awaited_once()


def test_get_review_404_when_missing():
    with patch("app.db.get_review", new=AsyncMock(return_value=None)):
        client = TestClient(app)
        resp = client.get(f"/api/games/{_GAME_ID}/review", params={"for_user_id": _USER_ID})
    assert resp.status_code == 404


def test_get_review_returns_stored_row():
    with patch("app.db.get_review", new=AsyncMock(return_value=_stored_row())):
        client = TestClient(app)
        resp = client.get(f"/api/games/{_GAME_ID}/review", params={"for_user_id": _USER_ID})
    assert resp.status_code == 200
    assert resp.json()["summary_md"] == "Two-sentence summary."
