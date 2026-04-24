from app.services.katago.features import (
    BLUNDER_THRESHOLDS,
    classify_phase,
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
