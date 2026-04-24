from __future__ import annotations

_COLS = "ABCDEFGHJKLMNOPQRST"  # standard Go columns, I is skipped


def to_coord(row: int, col: int, size: int) -> str:
    return f"{_COLS[col]}{size - row}"


def from_coord(coord: str, size: int) -> tuple[int, int]:
    col = _COLS.index(coord[0])
    row = size - int(coord[1:])
    return row, col
