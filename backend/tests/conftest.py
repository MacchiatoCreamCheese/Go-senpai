"""Patch the DB layer so API tests run without a real PostgreSQL instance."""
from unittest.mock import AsyncMock, patch

import pytest

from app.api.auth import get_current_user, soft_user
from app.main import app

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
    "claim_empty_seat": AsyncMock(
        return_value={"color": "W", "black_user_id": None, "white_user_id": None}
    ),
    "swap_colors": AsyncMock(return_value={"black_user_id": None, "white_user_id": None}),
    "get_review": AsyncMock(return_value=None),
    "insert_review": AsyncMock(return_value=None),
    "get_move_features": AsyncMock(return_value=[]),
    "count_move_features": AsyncMock(return_value=0),
    "get_move_note": AsyncMock(return_value=None),
    "insert_move_note": AsyncMock(return_value=None),
    "upsert_move_feature": AsyncMock(return_value=None),
    "retrieve_concepts_by_vector": AsyncMock(return_value=[]),
    "get_concept_hashes": AsyncMock(return_value={}),
    "upsert_concept": AsyncMock(return_value=None),
    "count_concepts": AsyncMock(return_value=0),
    "mark_game_processed_for_weakness": AsyncMock(return_value=True),
    "upsert_user_weakness": AsyncMock(return_value=None),
    "list_user_weaknesses": AsyncMock(return_value=[]),
    "upsert_problem": AsyncMock(return_value=None),
    "get_problem": AsyncMock(return_value=None),
    "list_candidate_problems": AsyncMock(return_value=[]),
    "record_drill_attempt": AsyncMock(return_value=None),
    "recent_problem_ids": AsyncMock(return_value=[]),
    "list_unreviewed_games_for_user": AsyncMock(return_value=[]),
    "list_concepts_seen": AsyncMock(return_value=[]),
    "record_concept_taught": AsyncMock(return_value=None),
    "mark_concepts_demonstrated": AsyncMock(return_value=None),
    "get_concept": AsyncMock(return_value=None),
}


@pytest.fixture(autouse=True)
def mock_db():
    app.dependency_overrides[soft_user] = lambda: None
    app.dependency_overrides[get_current_user] = lambda: None
    with patch.multiple("app.db", **_DB_STUBS):
        yield
    app.dependency_overrides.clear()


@pytest.fixture
def fake_user_id() -> str:
    return _FAKE_USER_ID
