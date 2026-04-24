from fastapi.testclient import TestClient

from app.main import app
from app.sessions import store

_USER_ID = "00000000-0000-0000-0000-000000000001"
_CREATE_GAME = {"size": 9, "user_id": _USER_ID, "color": "B"}


def _fresh_client() -> TestClient:
    store._games.clear()  # isolated per-test state
    return TestClient(app)


def test_create_game_returns_state():
    client = _fresh_client()
    resp = client.post("/api/games", json=_CREATE_GAME)
    assert resp.status_code == 201
    body = resp.json()
    assert body["size"] == 9
    assert body["komi"] == 5.5
    assert body["state"]["turn"] == "B"
    assert body["state"]["status"] == "active"
    assert all(cell == 0 for row in body["state"]["board"] for cell in row)


def test_play_capture_sequence():
    client = _fresh_client()
    game_id = client.post("/api/games", json=_CREATE_GAME).json()["id"]

    # black and white place stones that lead to black capturing a white stone.
    moves = [
        ("B", "play", 3, 4),
        ("W", "play", 4, 4),
        ("B", "play", 5, 4),
        ("W", "play", 0, 0),  # white plays away while black surrounds
        ("B", "play", 4, 3),
        ("W", "play", 0, 1),
        ("B", "play", 4, 5),  # captures white at (4,4)
    ]
    for color, kind, r, c in moves:
        r2 = client.post(
            f"/api/games/{game_id}/moves",
            json={"color": color, "kind": kind, "point": {"row": r, "col": c}},
        )
        assert r2.status_code == 200, r2.text

    state = client.get(f"/api/games/{game_id}").json()["state"]
    assert state["captures"]["B"] == 1
    assert state["board"][4][4] == 0


def test_illegal_move_rejected():
    client = _fresh_client()
    game_id = client.post("/api/games", json=_CREATE_GAME).json()["id"]
    # black plays, then white tries to play the same point.
    client.post(
        f"/api/games/{game_id}/moves",
        json={"color": "B", "kind": "play", "point": {"row": 4, "col": 4}},
    )
    resp = client.post(
        f"/api/games/{game_id}/moves",
        json={"color": "W", "kind": "play", "point": {"row": 4, "col": 4}},
    )
    assert resp.status_code == 400
    assert "occupied" in resp.json()["detail"]


def test_two_passes_finish_game():
    client = _fresh_client()
    game_id = client.post("/api/games", json=_CREATE_GAME).json()["id"]
    client.post(f"/api/games/{game_id}/moves", json={"color": "B", "kind": "pass"})
    client.post(f"/api/games/{game_id}/moves", json={"color": "W", "kind": "pass"})
    state = client.get(f"/api/games/{game_id}").json()["state"]
    assert state["status"] == "finished"
    assert state["result"] is not None


def test_sgf_download():
    client = _fresh_client()
    game_id = client.post("/api/games", json=_CREATE_GAME).json()["id"]
    client.post(
        f"/api/games/{game_id}/moves",
        json={"color": "B", "kind": "play", "point": {"row": 4, "col": 4}},
    )
    resp = client.get(f"/api/games/{game_id}/sgf")
    assert resp.status_code == 200
    assert resp.text.startswith("(;")
    assert "SZ[9]" in resp.text


def test_game_not_found():
    client = _fresh_client()
    assert client.get("/api/games/does-not-exist").status_code == 404
