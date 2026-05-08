from __future__ import annotations

from typing import Any

from sgfmill import sgf as _sgf

from .board import BLACK, WHITE
from .coords import from_coord
from .game import GameState, Move, MoveKind


_COLOR_TO_SGF = {BLACK: "b", WHITE: "w"}
_SGF_TO_COLOR = {"b": BLACK, "w": WHITE}


def _to_sgf_point(size: int, row: int, col: int) -> tuple[int, int]:
    # our rows are top-to-bottom; sgfmill rows are bottom-to-top.
    return (size - 1 - row, col)


def _from_sgf_point(size: int, sgf_row: int, col: int) -> tuple[int, int]:
    return (size - 1 - sgf_row, col)


def _annotation_comment(feat: dict[str, Any]) -> str | None:
    """One-line human-readable summary for the node comment (KaTrain-compatible).

    We key only on the fields we always populate post-Phase-2; skip silently
    when the row has no policy info (pass/resign, or pre-analysis games).
    """
    points_lost = feat.get("points_lost")
    if points_lost is None:
        return None
    parts = [f"Points lost: {points_lost:.1f}"]
    top = feat.get("top_move")
    if top:
        parts.append(f"Top: {top}")
    rank = feat.get("policy_rank")
    if rank is not None:
        parts.append(f"Policy rank: {rank}")
    wr = feat.get("winrate_before")
    if wr is not None:
        parts.append(f"Winrate: {wr * 100:.1f}%")
    score = feat.get("score_before")
    if score is not None:
        sign = "B" if score >= 0 else "W"
        parts.append(f"Score: {sign}+{abs(score):.1f}")
    return " | ".join(parts)


def export_sgf(
    game: GameState,
    features: list[dict[str, Any]] | None = None,
) -> bytes:
    """Serialise to SGF, optionally annotating each node with analysis data.

    `features` rows come from `db.get_move_features(game_id)`. When provided,
    each annotated node gets a `C` comment (points lost, top move, winrate,
    score) and an `MA` mark on the top-move square if KataGo preferred a
    different move. Opens cleanly in KaTrain (which reads `C`, `MA`, `SQ`).
    """
    feat_by_number: dict[int, dict[str, Any]] = {}
    if features:
        feat_by_number = {int(f["move_number"]): f for f in features}

    sgf_game = _sgf.Sgf_game(size=game.size)
    root = sgf_game.get_root()
    root.set("KM", game.komi)
    if game.result:
        root.set("RE", game.result)

    for idx, move in enumerate(game.moves):
        node = sgf_game.extend_main_sequence()
        sgf_color = _COLOR_TO_SGF[move.color]
        if move.kind == MoveKind.PLAY and move.point is not None:
            node.set_move(sgf_color, _to_sgf_point(game.size, *move.point))
        elif move.kind == MoveKind.PASS:
            node.set_move(sgf_color, None)
        elif move.kind == MoveKind.RESIGN:
            # SGF has no per-node resign; we record it via RE on the root, already set.
            break

        feat = feat_by_number.get(idx + 1)  # move_number is 1-indexed
        if feat:
            comment = _annotation_comment(feat)
            if comment:
                node.set("C", comment)
            top = feat.get("top_move")
            if (
                top
                and move.kind == MoveKind.PLAY
                and move.point is not None
                and top not in ("pass", "resign")
            ):
                try:
                    tr, tc = from_coord(top.upper(), game.size)
                except (ValueError, IndexError):
                    tr = tc = None  # type: ignore[assignment]
                if tr is not None and (tr, tc) != move.point:
                    node.set("MA", [_to_sgf_point(game.size, tr, tc)])

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
