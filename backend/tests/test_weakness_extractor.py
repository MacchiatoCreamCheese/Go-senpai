from __future__ import annotations

from app.services.weakness.extractor import THEMES, extract_evidence


def _feat(
    *,
    move_number: int,
    color: str = "B",
    coord: str = "D4",
    phase: str = "middlegame",
    points_lost: float | None = 0.0,
    policy_rank: int | None = 0,
    is_blunder: bool = False,
    score_stdev_before: float | None = 1.0,
) -> dict:
    return {
        "move_number": move_number,
        "color": color,
        "coord": coord,
        "phase": phase,
        "points_lost": points_lost,
        "policy_rank": policy_rank,
        "is_blunder": is_blunder,
        "score_stdev_before": score_stdev_before,
    }


def _by_theme(evidence):
    return {e.theme: e for e in evidence}


def test_empty_features_returns_all_themes_zero():
    ev = extract_evidence([])
    assert {e.theme for e in ev} == set(THEMES)
    assert all(e.score == 0.0 for e in ev)
    assert all(e.supporting_moves == 0 for e in ev)


def test_clean_game_no_evidence():
    feats = [
        _feat(move_number=i, phase="middlegame", points_lost=0.2, policy_rank=1)
        for i in range(1, 21)
    ]
    scores = _by_theme(extract_evidence(feats))
    assert scores["blunder_middlegame"].score == 0.0
    assert scores["ignored_top_move"].score == 0.0
    assert scores["low_consistency_opening"].score == 0.0


def test_one_middlegame_blunder_in_twenty():
    feats = [_feat(move_number=i, phase="middlegame", points_lost=0.3, policy_rank=1) for i in range(1, 20)]
    feats.append(_feat(move_number=20, phase="middlegame", points_lost=8.0, policy_rank=7, is_blunder=True))
    scores = _by_theme(extract_evidence(feats))
    assert abs(scores["blunder_middlegame"].score - (1 / 20)) < 1e-6
    assert scores["blunder_middlegame"].supporting_moves == 1


def test_ignored_top_move_tallies_only_high_rank_and_large_loss():
    feats = [
        _feat(move_number=1, policy_rank=1, points_lost=0.0),    # top — skip
        _feat(move_number=2, policy_rank=6, points_lost=2.0),    # hit
        _feat(move_number=3, policy_rank=7, points_lost=0.3),    # rank ok but loss too small
        _feat(move_number=4, policy_rank=3, points_lost=3.0),    # rank too small
        _feat(move_number=5, policy_rank=10, points_lost=5.0),   # hit
    ]
    scores = _by_theme(extract_evidence(feats))
    assert scores["ignored_top_move"].supporting_moves == 2
    assert abs(scores["ignored_top_move"].score - (2 / 5)) < 1e-6


def test_low_consistency_endgame_saturates_at_threshold():
    feats = [
        _feat(move_number=i, phase="endgame", points_lost=2.0, score_stdev_before=1.0, policy_rank=2)
        for i in range(1, 11)
    ]
    scores = _by_theme(extract_evidence(feats))
    # Mean confident_points_lost = 2.0, threshold 1.0 → saturates to 1.0.
    assert scores["low_consistency_endgame"].score == 1.0


def test_pass_and_resign_are_skipped():
    feats = [
        _feat(move_number=1, phase="middlegame", coord="pass", points_lost=None, policy_rank=None),
        _feat(move_number=2, phase="middlegame", coord="resign", points_lost=None, policy_rank=None),
        _feat(move_number=3, phase="middlegame", is_blunder=True, points_lost=10.0, policy_rank=9),
    ]
    scores = _by_theme(extract_evidence(feats))
    # Only one real move, which is a blunder → score 1.0, not 1/3.
    assert scores["blunder_middlegame"].score == 1.0
