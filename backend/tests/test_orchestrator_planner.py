from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.orchestrator.planner import choose_next_action


_NOW = datetime(2026, 4, 25, 12, 0, tzinfo=timezone.utc)


def test_unreviewed_game_wins_over_everything():
    action = choose_next_action(
        weaknesses=[{"theme": "blunder_middlegame", "severity": 0.9}],
        unreviewed_games=[{"id": "g1"}],
        concepts_seen=[
            {
                "concept_id": "shape_fundamentals",
                "times_taught": 1,
                "last_taught_at": _NOW - timedelta(days=2),
                "user_demonstrated": False,
            }
        ],
        has_candidate_drill=True,
        now=_NOW,
    )
    assert action["kind"] == "review_game"
    assert action["game_id"] == "g1"


def test_revisit_beats_teach_when_stale_and_undemonstrated():
    action = choose_next_action(
        weaknesses=[{"theme": "blunder_opening", "severity": 0.8}],
        unreviewed_games=[],
        concepts_seen=[
            {
                "concept_id": "opening_principles",
                "times_taught": 1,
                "last_taught_at": _NOW - timedelta(days=2),
                "user_demonstrated": False,
            }
        ],
        has_candidate_drill=True,
        now=_NOW,
    )
    assert action["kind"] == "revisit_concept"
    assert action["concept_id"] == "opening_principles"


def test_teach_when_weakness_above_threshold_and_concept_unseen():
    action = choose_next_action(
        weaknesses=[{"theme": "ignored_top_move", "severity": 0.5}],
        unreviewed_games=[],
        concepts_seen=[],
        has_candidate_drill=True,
        now=_NOW,
    )
    assert action["kind"] == "teach_concept"
    assert action["concept_id"] == "shape_fundamentals"


def test_serve_drill_when_no_signals():
    action = choose_next_action(
        weaknesses=[{"theme": "ignored_top_move", "severity": 0.05}],
        unreviewed_games=[],
        concepts_seen=[],
        has_candidate_drill=True,
        now=_NOW,
    )
    assert action["kind"] == "serve_drill"


def test_idle_when_no_drill_available():
    action = choose_next_action(
        weaknesses=[],
        unreviewed_games=[],
        concepts_seen=[],
        has_candidate_drill=False,
        now=_NOW,
    )
    assert action["kind"] == "idle"


def test_demonstrated_concept_does_not_trigger_revisit():
    action = choose_next_action(
        weaknesses=[],
        unreviewed_games=[],
        concepts_seen=[
            {
                "concept_id": "opening_principles",
                "times_taught": 1,
                "last_taught_at": _NOW - timedelta(days=30),
                "user_demonstrated": True,
            }
        ],
        has_candidate_drill=True,
        now=_NOW,
    )
    assert action["kind"] == "serve_drill"
