import asyncio
from unittest.mock import AsyncMock, patch

from app.services.review.retriever import (
    RetrievedConcept,
    moment_query_text,
    retrieve_for_moment,
)
from app.services.review.selector import Moment


def _moment(**kw):
    base = dict(
        move_number=47,
        color="B",
        coord="K10",
        top_move="Q5",
        points_lost=8.2,
        confident_points_lost=8.2,
        winrate_before=0.58,
        winrate_after=0.42,
        score_before=2.0,
        score_after=-6.2,
        phase="middlegame",
        is_blunder=True,
        kind="blunder",
    )
    base.update(kw)
    return Moment(**base)


def test_query_text_mentions_phase_kind_coords_and_winrate():
    q = moment_query_text(_moment())
    assert "middlegame" in q
    assert "blunder" in q
    assert "K10" in q
    assert "Q5" in q
    assert "8.2" in q
    assert "16 percent" in q


def test_query_text_handles_missing_top_move():
    q = moment_query_text(_moment(top_move=None))
    assert "K10" not in q or "instead of" not in q  # no "played X instead of Y" line
    assert "middlegame" in q


def test_retrieve_for_moment_passes_embedding_to_db():
    fake_vec = [0.1] * 384
    fake_rows = [
        {"id": "empty_triangle", "title": "Empty Triangle", "tags": ["shape"], "body_md": "..."},
        {"id": "direction_of_play", "title": "Direction of Play", "tags": ["strategy"], "body_md": "..."},
    ]
    with patch(
        "app.services.review.retriever.embed_text",
        new=AsyncMock(return_value=fake_vec),
    ), patch(
        "app.db.retrieve_concepts_by_vector",
        new=AsyncMock(return_value=fake_rows),
    ) as db_call:
        out = asyncio.run(retrieve_for_moment(_moment(), limit=2))

    db_call.assert_awaited_once()
    args, kwargs = db_call.call_args
    assert args[0] == fake_vec
    assert kwargs.get("limit") == 2
    assert [c.id for c in out] == ["empty_triangle", "direction_of_play"]
    assert isinstance(out[0], RetrievedConcept)
