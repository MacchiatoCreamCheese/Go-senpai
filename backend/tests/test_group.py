from app.engine.board import BLACK, Board, WHITE
from app.engine.group import find_group


def test_single_stone_middle_has_four_liberties():
    b = Board(size=9)
    b.set(4, 4, BLACK)
    stones, liberties = find_group(b, 4, 4)
    assert stones == {(4, 4)}
    assert liberties == {(3, 4), (5, 4), (4, 3), (4, 5)}


def test_single_stone_corner_has_two_liberties():
    b = Board(size=9)
    b.set(0, 0, BLACK)
    stones, liberties = find_group(b, 0, 0)
    assert stones == {(0, 0)}
    assert liberties == {(0, 1), (1, 0)}


def test_connected_stones_share_liberties():
    b = Board(size=9)
    b.set(3, 3, BLACK)
    b.set(3, 4, BLACK)
    b.set(3, 5, BLACK)
    stones, liberties = find_group(b, 3, 4)
    assert stones == {(3, 3), (3, 4), (3, 5)}
    # above row 2, below row 4, left of 3, right of 5
    assert liberties == {(2, 3), (2, 4), (2, 5), (4, 3), (4, 4), (4, 5), (3, 2), (3, 6)}


def test_enemy_stones_break_connection():
    b = Board(size=9)
    b.set(3, 3, BLACK)
    b.set(3, 4, WHITE)
    b.set(3, 5, BLACK)
    stones, _ = find_group(b, 3, 3)
    assert stones == {(3, 3)}
