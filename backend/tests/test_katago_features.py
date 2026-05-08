from app.services.katago.features import (
    BLUNDER_THRESHOLDS,
    classify_phase,
    confidence_weight,
    extract,
    is_blunder,
)


def test_classify_phase_19():
    area = 19 * 19
    assert classify_phase(0, 19) == "opening"
    assert classify_phase(int(0.3 * area) - 1, 19) == "opening"
    assert classify_phase(int(0.5 * area), 19) == "middlegame"
    assert classify_phase(int(0.7 * area) + 1, 19) == "endgame"


def test_is_blunder_thresholds():
    for size, threshold in BLUNDER_THRESHOLDS.items():
        assert is_blunder(threshold, size) is True
        assert is_blunder(threshold - 0.01, size) is False
    assert is_blunder(None, 19) is False


def _response(score_lead_top=10.0, score_lead_played=2.0, played="D4"):
    return {
        "rootInfo": {"winrate": 0.62, "scoreLead": score_lead_top},
        "moveInfos": [
            {"move": "Q16", "order": 0, "winrate": 0.63, "scoreLead": score_lead_top},
            {"move": played, "order": 3, "winrate": 0.40, "scoreLead": score_lead_played},
        ],
    }


def test_extract_normal_move():
    feats = extract(
        move_number=10,
        color="B",
        played_coord="D4",
        board_size=19,
        katago_response=_response(),
    )
    assert feats.policy_rank == 3
    assert feats.top_move == "Q16"
    assert feats.points_lost == 8.0  # score_before(10) - score_after(2)
    assert feats.is_blunder is True
    assert feats.phase == "opening"


def test_extract_top_choice_no_loss():
    resp = _response(score_lead_top=5.0, score_lead_played=5.0, played="Q16")
    feats = extract(
        move_number=10, color="B", played_coord="Q16", board_size=19, katago_response=resp
    )
    assert feats.points_lost == 0.0
    assert feats.is_blunder is False
    assert feats.policy_rank == 0


def test_extract_pass_returns_nulls():
    feats = extract(
        move_number=300,
        color="W",
        played_coord="pass",
        board_size=19,
        katago_response=_response(),
    )
    assert feats.points_lost is None
    assert feats.policy_rank is None
    assert feats.top_move is None
    assert feats.is_blunder is False
    assert feats.phase == "endgame"


def test_extract_unknown_played_move():
    resp = _response()
    feats = extract(
        move_number=5,
        color="B",
        played_coord="A1",  # not in moveInfos
        board_size=9,
        katago_response=resp,
    )
    assert feats.policy_rank == 999
    assert feats.score_after is None


def test_confidence_weight_boundaries():
    assert confidence_weight(None) == 1.0
    assert confidence_weight(0.0) == 1.0
    assert confidence_weight(2.0) == 1.0
    assert abs(confidence_weight(10.0) - 0.3) < 1e-9
    assert abs(confidence_weight(20.0) - 0.3) < 1e-9
    # Linear midpoint between 2 and 10 → weight midway between 1.0 and 0.3
    mid = confidence_weight(6.0)
    assert abs(mid - 0.65) < 1e-9


def test_extract_confidence_weighted_points_lost():
    resp = {
        "rootInfo": {"winrate": 0.55, "scoreLead": 10.0, "scoreStdev": 12.0},
        "moveInfos": [
            {"move": "Q16", "order": 0, "winrate": 0.60, "scoreLead": 10.0,
             "pv": ["Q16", "R4", "P5"]},
            {"move": "D4", "order": 5, "winrate": 0.40, "scoreLead": 2.0,
             "pv": ["D4"]},
        ],
    }
    feats = extract(
        move_number=5, color="B", played_coord="D4", board_size=19, katago_response=resp
    )
    assert feats.points_lost == 8.0                 # raw, unchanged
    assert feats.confident_points_lost == 8.0 * 0.3  # stdev saturates floor
    # With the low confidence weight, 2.4pt is well under the 19x19 threshold of 5.
    assert feats.is_blunder is False
    assert feats.score_stdev_before == 12.0


def test_extract_top_move_points_lost_computed():
    resp = {
        "rootInfo": {"winrate": 0.55, "scoreLead": 4.0},
        "moveInfos": [
            {"move": "Q16", "order": 0, "winrate": 0.60, "scoreLead": 10.0},
            {"move": "D4", "order": 2, "winrate": 0.40, "scoreLead": 2.0},
        ],
    }
    feats = extract(
        move_number=5, color="B", played_coord="D4", board_size=19, katago_response=resp
    )
    # top_score(10) - score_before(4) = 6.0 — the difference the top move
    # would have gained over the current root eval. Used to be hardcoded 0.0.
    assert feats.top_move_points_lost == 6.0


def test_extract_captures_top_pv():
    resp = {
        "rootInfo": {"winrate": 0.6, "scoreLead": 5.0},
        "moveInfos": [
            {"move": "Q5", "order": 0, "winrate": 0.6, "scoreLead": 5.0,
             "pv": ["Q5", "R4", "P6", "Q7", "P7", "O6", "N5", "M4", "L3"]},
            {"move": "K10", "order": 4, "winrate": 0.4, "scoreLead": -1.0,
             "pv": ["K10"]},
        ],
    }
    feats = extract(
        move_number=47, color="B", played_coord="K10", board_size=19,
        katago_response=resp,
    )
    # Trimmed to 8 plies.
    assert feats.top_pv == ["Q5", "R4", "P6", "Q7", "P7", "O6", "N5", "M4"]


def test_extract_missing_pv_returns_none():
    resp = {
        "rootInfo": {"winrate": 0.5, "scoreLead": 0.0},
        "moveInfos": [
            {"move": "Q16", "order": 0, "winrate": 0.5, "scoreLead": 0.0},
        ],
    }
    feats = extract(
        move_number=1, color="B", played_coord="Q16", board_size=19,
        katago_response=resp,
    )
    assert feats.top_pv is None
