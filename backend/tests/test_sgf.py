from app.engine.game import GameState, MoveKind
from app.engine.board import BLACK, WHITE
from app.engine.sgf import export_sgf, import_sgf


def test_roundtrip_preserves_moves():
    g = GameState.new(size=9, komi=5.5)
    g.play(BLACK, MoveKind.PLAY, (2, 2))
    g.play(WHITE, MoveKind.PLAY, (6, 6))
    g.play(BLACK, MoveKind.PLAY, (2, 6))
    g.play(WHITE, MoveKind.PASS)
    g.play(BLACK, MoveKind.PASS)

    data = export_sgf(g)
    restored = import_sgf(data)

    assert restored.size == 9
    assert restored.komi == 5.5
    # restored game replays the same move sequence and ends with two passes → finished.
    assert len(restored.moves) == 5
    assert restored.moves[0].point == (2, 2)
    assert restored.moves[1].point == (6, 6)
    assert restored.moves[2].point == (2, 6)
    assert restored.moves[3].kind == MoveKind.PASS
    assert restored.moves[4].kind == MoveKind.PASS


def test_sgf_records_result():
    g = GameState.new(size=9, komi=5.5)
    g.play(BLACK, MoveKind.PASS)
    g.play(WHITE, MoveKind.PASS)
    assert g.result is not None
    data = export_sgf(g)
    assert b"RE[" in data
