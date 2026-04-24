"""Patch the DB layer so API tests run without a real PostgreSQL instance."""
from unittest.mock import AsyncMock, patch

import pytest

_FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"

FAKE_USER = {"id": _FAKE_USER_ID, "handle": "tester"}

# Stub responses for every db function used by rest.py
_DB_STUBS = {
    "create_user": AsyncMock(return_value=FAKE_USER),
    "get_user": AsyncMock(return_value=FAKE_USER),
    "create_game": AsyncMock(return_value=None),
    "insert_move": AsyncMock(return_value=None),
    "finish_game": AsyncMock(return_value=None),
    "get_game_row": AsyncMock(return_value=None),  # no row → 404 for unknown games
    "get_moves": AsyncMock(return_value=[]),
    "list_user_games": AsyncMock(return_value=[]),
}


@pytest.fixture(autouse=True)
def mock_db():
    with patch.multiple("app.db", **_DB_STUBS):
        yield


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID
