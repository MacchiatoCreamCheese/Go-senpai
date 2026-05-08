from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.sessions import store


_BLACK = "00000000-0000-0000-0000-000000000001"
_WHITE = "00000000-0000-0000-0000-000000000002"


def _fresh_client() -> TestClient:
    store._games.clear()
    return TestClient(app)


def _create_game(client: TestClient, color: str = "B") -> str:
    return client.post(
        "/api/games", json={"size": 9, "user_id": _BLACK, "color": color}
    ).json()["id"]


def test_create_game_records_creator_in_chosen_seat():
    client = _fresh_client()
    body = client.post(
        "/api/games", json={"size": 9, "user_id": _BLACK, "color": "W"}
    ).json()
    assert body["black_user_id"] is None
    assert body["white_user_id"] == _BLACK


def test_join_claims_empty_seat_and_returns_players():
    client = _fresh_client()
    game_id = _create_game(client, color="B")

    with patch(
        "app.db.claim_empty_seat",
        new=AsyncMock(
            return_value={"color": "W", "black_user_id": _BLACK, "white_user_id": _WHITE}
        ),
    ) as call:
        resp = client.post(f"/api/games/{game_id}/join", json={"user_id": _WHITE})

    assert resp.status_code == 200, resp.text
    call.assert_awaited_once_with(game_id, _WHITE)
    body = resp.json()
    assert body["black_user_id"] == _BLACK
    assert body["white_user_id"] == _WHITE


def test_join_409_when_both_seats_taken():
    client = _fresh_client()
    game_id = _create_game(client)

    with patch(
        "app.db.claim_empty_seat",
        new=AsyncMock(side_effect=ValueError("both seats are already taken")),
    ):
        resp = client.post(f"/api/games/{game_id}/join", json={"user_id": _WHITE})

    assert resp.status_code == 409
    assert "both seats" in resp.json()["detail"]


def test_join_409_when_user_already_seated():
    client = _fresh_client()
    game_id = _create_game(client)

    with patch(
        "app.db.claim_empty_seat",
        new=AsyncMock(side_effect=ValueError("you are already in this game")),
    ):
        resp = client.post(f"/api/games/{game_id}/join", json={"user_id": _BLACK})

    assert resp.status_code == 409
    assert "already in this game" in resp.json()["detail"]


def test_swap_colors_before_any_move():
    client = _fresh_client()
    game_id = _create_game(client)

    with patch(
        "app.db.swap_colors",
        new=AsyncMock(return_value={"black_user_id": _WHITE, "white_user_id": _BLACK}),
    ) as call:
        resp = client.post(f"/api/games/{game_id}/swap_colors")

    assert resp.status_code == 200, resp.text
    call.assert_awaited_once_with(game_id)
    body = resp.json()
    assert body["black_user_id"] == _WHITE
    assert body["white_user_id"] == _BLACK


def test_swap_colors_409_after_move():
    client = _fresh_client()
    game_id = _create_game(client)

    with patch(
        "app.db.swap_colors",
        new=AsyncMock(side_effect=ValueError("cannot swap colours after a move has been played")),
    ):
        resp = client.post(f"/api/games/{game_id}/swap_colors")

    assert resp.status_code == 409
    assert "after a move" in resp.json()["detail"]
