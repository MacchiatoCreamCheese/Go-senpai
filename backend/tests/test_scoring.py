from app.engine.board import BLACK, Board, WHITE
from app.engine.scoring import score_area


def test_empty_board_gives_only_komi_to_white():
    b = Board(size=9)
    out = score_area(b, komi=5.5)
    assert out.black_score == 0
    assert out.white_score == 5.5


def test_all_black_stones_gets_whole_board():
    b = Board(size=9)
    for r in range(9):
        for c in range(9):
            b.set(r, c, BLACK)
    out = score_area(b, komi=5.5)
    assert out.black_stones == 81
    assert out.black_score == 81
    # white has no stones and no territory, only komi
    assert out.white_score == 5.5


def test_half_and_half_split():
    b = Board(size=9)
    # column 4 is a wall; left half black, right half white.
    for r in range(9):
        b.set(r, 4, BLACK)
    for r in range(9):
        for c in range(5, 9):
            b.set(r, c, WHITE)
    # left side (cols 0-3) empty, bordered only by black -> black territory.
    out = score_area(b, komi=5.5)
    # black: 9 stones (col 4) + 4*9=36 territory = 45
    assert out.black_stones == 9
    assert out.black_territory == 36
    assert out.black_score == 45
    # white: 4*9=36 stones + 0 territory + 5.5 komi = 41.5
    assert out.white_stones == 36
    assert out.white_territory == 0
    assert out.white_score == 41.5


def test_contested_region_counts_for_neither():
    b = Board(size=9)
    # a single black and a single white with a big empty space between them.
    b.set(0, 0, BLACK)
    b.set(8, 8, WHITE)
    out = score_area(b, komi=5.5)
    # the single empty region borders both -> territory for neither.
    assert out.black_territory == 0
    assert out.white_territory == 0
    assert out.black_score == 1
    assert out.white_score == 1 + 5.5
