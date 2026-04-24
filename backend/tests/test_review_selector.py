from app.services.review.selector import pick_moments


def _feat(**kw):
    base = {
        "move_number": 1,
        "color": "B",
        "coord": "D4",
        "points_lost": 0.0,
        "policy_rank": 0,
        "top_move": "D4",
        "winrate_before": 0.5,
        "winrate_after": 0.5,
        "score_before": 0.0,
        "score_after": 0.0,
        "phase": "middlegame",
        "is_blunder": False,
    }
    base.update(kw)
    return base


def test_picks_blunders_for_requested_color_only():
    features = [
        _feat(move_number=10, color="B", points_lost=8.0, is_blunder=True, coord="K10"),
        _feat(move_number=11, color="W", points_lost=10.0, is_blunder=True, coord="Q5"),
        _feat(move_number=12, color="B", points_lost=6.0, is_blunder=True, coord="D17"),
    ]
    moments = pick_moments(features, "B")
    assert [m.move_number for m in moments] == [10, 12]
    assert all(m.color == "B" for m in moments)
    assert moments[0].kind == "blunder"


def test_blunders_outrank_critical_decisions():
    features = [
        _feat(
            move_number=5, color="B", points_lost=2.5,
            policy_rank=5, is_blunder=False,
        ),
        _feat(
            move_number=6, color="B", points_lost=6.0,
            policy_rank=2, is_blunder=True,
        ),
    ]
    moments = pick_moments(features, "B", n=1)
    assert len(moments) == 1
    assert moments[0].move_number == 6
    assert moments[0].kind == "blunder"


def test_critical_decisions_require_rank_and_points():
    features = [
        _feat(move_number=3, color="B", points_lost=2.0, policy_rank=1, is_blunder=False),  # rank too low
        _feat(move_number=4, color="B", points_lost=0.5, policy_rank=5, is_blunder=False),  # points too low
        _feat(move_number=5, color="B", points_lost=2.0, policy_rank=4, is_blunder=False),  # qualifies
    ]
    moments = pick_moments(features, "B")
    assert [m.move_number for m in moments] == [5]
    assert moments[0].kind == "critical_decision"


def test_phase_cap_prevents_all_one_phase():
    features = [
        _feat(move_number=i, color="B", points_lost=10.0 - i, is_blunder=True, phase="opening")
        for i in range(1, 6)
    ] + [
        _feat(move_number=50, color="B", points_lost=5.0, is_blunder=True, phase="middlegame"),
        _feat(move_number=80, color="B", points_lost=5.0, is_blunder=True, phase="endgame"),
    ]
    moments = pick_moments(features, "B", n=4, max_per_phase=2)
    phases = [m.phase for m in moments]
    assert phases.count("opening") == 2
    assert "middlegame" in phases
    assert "endgame" in phases


def test_skips_pass_and_resign():
    features = [
        _feat(move_number=1, color="B", points_lost=20.0, is_blunder=True, coord="pass"),
        _feat(move_number=2, color="B", points_lost=20.0, is_blunder=True, coord="resign"),
        _feat(move_number=3, color="B", points_lost=5.0, is_blunder=True, coord="K10"),
    ]
    moments = pick_moments(features, "B")
    assert [m.move_number for m in moments] == [3]


def test_returns_empty_when_no_mistakes():
    features = [_feat(move_number=i, color="B", points_lost=0.1, policy_rank=0) for i in range(5)]
    assert pick_moments(features, "B") == []
