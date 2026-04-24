from __future__ import annotations

import json
from typing import Any

from .retriever import RetrievedConcept
from .selector import Moment


SYSTEM_PROMPT = """You are a Go (Weiqi/Baduk) reviewer. You do not see the board.
You only receive structured KataGo analysis of specific moves plus a small
library of Go concepts retrieved for each moment.

Hard rules:
- Every claim you make must reference a provided feature (move_number, coord,
  top_move, points_lost, winrate_before/after) or a provided concept id.
- Do not invent moves, coordinates, captures, players, or outcomes.
- Do not speculate about positions you were not shown.
- If the provided data is insufficient for a moment, say so plainly rather
  than inventing detail.

Output: return ONLY a JSON object with this exact shape, no prose around it:

{
  "summary_md": "<two sentences>",
  "moments": [
    {
      "move_number": <int>,
      "explanation_md": "<2-4 sentences: what happened, why it was wrong, what to play instead>",
      "concept_ids": ["<concept id used>", ...]
    }
  ]
}
"""


def _moment_block(moment: Moment, concepts: list[RetrievedConcept]) -> dict[str, Any]:
    return {
        "move_number": moment.move_number,
        "color": moment.color,
        "played_coord": moment.coord,
        "top_move": moment.top_move,
        "points_lost": round(moment.points_lost, 2),
        "winrate_before": _pct(moment.winrate_before),
        "winrate_after": _pct(moment.winrate_after),
        "score_before": _round(moment.score_before),
        "score_after": _round(moment.score_after),
        "phase": moment.phase,
        "kind": moment.kind,
        "retrieved_concepts": [{"id": c.id, "title": c.title} for c in concepts],
    }


def _pct(v: float | None) -> float | None:
    return None if v is None else round(v * 100, 1)


def _round(v: float | None) -> float | None:
    return None if v is None else round(v, 2)


def build_review_prompt(
    *,
    game: dict[str, Any],
    player_color: str,
    moments: list[Moment],
    concepts_per_moment: list[list[RetrievedConcept]],
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) strings."""
    assert len(moments) == len(concepts_per_moment)

    concept_library: dict[str, dict[str, str]] = {}
    for bucket in concepts_per_moment:
        for c in bucket:
            concept_library[c.id] = {"title": c.title, "body_md": c.body_md}

    user_payload = {
        "game": {
            "board_size": game.get("board_size"),
            "komi": _float(game.get("komi")),
            "result": game.get("result"),
            "reviewing_color": "Black" if player_color == "B" else "White",
        },
        "moments": [
            _moment_block(m, concepts_per_moment[i]) for i, m in enumerate(moments)
        ],
        "concept_library": concept_library,
    }
    return SYSTEM_PROMPT, json.dumps(user_payload, indent=2)


def _float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
