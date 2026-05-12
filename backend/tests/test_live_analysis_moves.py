from app.services.katago.live_analysis import db_moves_to_katago_tuples


def test_db_moves_to_katago_tuples_truncates_before_resign():
    moves = [
        {"color": "B", "coord": "d4"},
        {"color": "W", "coord": "q16"},
        {"color": "B", "coord": "resign"},
        {"color": "W", "coord": "pass"},
    ]
    assert db_moves_to_katago_tuples(moves) == [("B", "D4"), ("W", "Q16")]


def test_db_moves_to_katago_tuples_uppercases_coords():
    moves = [{"color": "B", "coord": "q4"}]
    assert db_moves_to_katago_tuples(moves) == [("B", "Q4")]
