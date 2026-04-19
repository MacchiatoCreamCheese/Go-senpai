from __future__ import annotations

from sgfmill import sgf as _sgf

from .board import BLACK, WHITE
from .game import GameState, Move, MoveKind


_COLOR_TO_SGF = {BLACK: "b", WHITE: "w"}
_SGF_TO_COLOR = {"b": BLACK, "w": WHITE}


def _to_sgf_point(size: int, row: int, col: int) -> tuple[int, int]:
    # our rows are top-to-bottom; sgfmill rows are bottom-to-top.
    return (size - 1 - row, col)


def _from_sgf_point(size: int, sgf_row: int, col: int) -> tuple[int, int]:
    return (size - 1 - sgf_row, col)


def export_sgf(game: GameState) -> bytes:
    sgf_game = _sgf.Sgf_game(size=game.size)
    root = sgf_game.get_root()
    root.set("KM", game.komi)
    if game.result:
        root.set("RE", game.result)

    for move in game.moves:
        node = sgf_game.extend_main_sequence()
        sgf_color = _COLOR_TO_SGF[move.color]
        if move.kind == MoveKind.PLAY and move.point is not None:
            node.set_move(sgf_color, _to_sgf_point(game.size, *move.point))
        elif move.kind == MoveKind.PASS:
            node.set_move(sgf_color, None)
        elif move.kind == MoveKind.RESIGN:
            # SGF has no per-node resign; we record it via RE on the root, already set.
            break
    return sgf_game.serialise()


def import_sgf(data: bytes) -> GameState:
    sgf_game = _sgf.Sgf_game.from_bytes(data)
    size = sgf_game.get_size()
    try:
        komi = sgf_game.get_komi()
    except ValueError:
        from .game import DEFAULT_KOMI
        komi = DEFAULT_KOMI.get(size, 7.5)

    game = GameState.new(size=size, komi=komi)
    for node in sgf_game.get_main_sequence()[1:]:
        sgf_color, sgf_point = node.get_move()
        if sgf_color is None:
            continue
        color = _SGF_TO_COLOR[sgf_color]
        if sgf_point is None:
            game.play(color, MoveKind.PASS)
        else:
            sgf_row, col = sgf_point
            game.play(color, MoveKind.PLAY, _from_sgf_point(size, sgf_row, col))
    return game
