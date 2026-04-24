from __future__ import annotations

import hashlib
import json


def position_hash(
    board_size: int,
    komi: float,
    rules: str,
    moves: list[tuple[str, str]],
) -> bytes:
    """SHA-256 over normalized (size, komi, rules, moves[]).

    `moves` is a list of (color, coord) where color is 'B'/'W' and coord is in
    KataGo notation ('D4', 'pass'). Order-sensitive; identical move sequences
    on identical board parameters produce identical hashes.
    """
    payload = json.dumps(
        {
            "size": board_size,
            "komi": round(float(komi), 2),
            "rules": rules,
            "moves": [[c.upper(), m.upper()] for c, m in moves],
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).digest()
