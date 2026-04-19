import pytest

from app.engine.board import BLACK, Board, EMPTY, WHITE, opponent


def test_new_board_is_empty():
    b = Board(size=9)
    assert b.size == 9
    for row in b.grid:
        assert all(c == EMPTY for c in row)


def test_invalid_size_rejected():
    with pytest.raises(ValueError):
        Board(size=11)


def test_set_and_get():
    b = Board(size=9)
    b.set(3, 4, BLACK)
    assert b.get(3, 4) == BLACK
    assert b.get(3, 3) == EMPTY


def test_in_bounds():
    b = Board(size=9)
    assert b.in_bounds(0, 0)
    assert b.in_bounds(8, 8)
    assert not b.in_bounds(-1, 0)
    assert not b.in_bounds(9, 0)


def test_neighbors_corner_and_middle():
    b = Board(size=9)
    assert set(b.neighbors(0, 0)) == {(0, 1), (1, 0)}
    assert set(b.neighbors(4, 4)) == {(3, 4), (5, 4), (4, 3), (4, 5)}


def test_copy_is_independent():
    b = Board(size=9)
    b.set(2, 2, BLACK)
    c = b.copy()
    c.set(3, 3, WHITE)
    assert b.get(3, 3) == EMPTY
    assert c.get(2, 2) == BLACK


def test_snapshot_is_hashable_and_distinguishing():
    b = Board(size=9)
    s1 = b.snapshot()
    b.set(0, 0, BLACK)
    s2 = b.snapshot()
    assert s1 != s2
    assert {s1, s2}  # hashable


def test_opponent():
    assert opponent(BLACK) == WHITE
    assert opponent(WHITE) == BLACK
    with pytest.raises(ValueError):
        opponent(EMPTY)
