from __future__ import annotations

import json
from typing import Any

from .retriever import RetrievedConcept
from .selector import Moment


_SYSTEM_BASE = """You are a Go (Weiqi/Baduk) coach writing a post-game review.
You do not see the board. You only receive structured KataGo analysis of specific
moves plus a small library of Go concepts retrieved for each moment.

Hard rules — these override everything else:
- Every claim must reference a provided feature (move_number, coord, top_move,
  points_lost, winrate_before/after, continuation) or a provided concept id.
- Do not invent moves, coordinates, captures, players, or outcomes.
- Do not speculate about positions you were not shown.
- If a moment includes a "continuation" list, reference the first 2-3 moves
  explicitly when explaining what to play instead. Treat it as authoritative.
- If the data for a moment is insufficient, say so plainly.

Output: return ONLY a JSON object with this exact shape, no prose around it:

{{
  "summary_md": "<two sentences>",
  "moments": [
    {{
      "move_number": <int>,
      "explanation_md": "<coaching note in the tone described below>",
      "concept_ids": ["<concept id used>", ...]
    }}
  ]
}}

{tone_section}"""

_TONE_BEGINNER = """TONE: beginner (player is roughly 15k or weaker)
Write warmly, like a patient teacher sitting across the board.
- Open with what happened in human terms: "This was the moment the game started
  slipping" or "Here you had a chance to take charge."
- Use plain language. Define every Go term the first time it appears:
  "joseki (the standard corner sequence)", "sente (a move your opponent must answer)".
- Use spatial analogies when helpful: "claiming this area is like planting a flag before your opponent can."
- If a continuation is provided, tell it as a short story: "If White then enters at X, you answer Y and your side stays intact."
- Close each moment with one named principle: "Concept: in the opening, prefer big moves over safe ones."
- Length: 3–5 sentences per moment."""

_TONE_INTERMEDIATE = """TONE: intermediate (player is roughly 15k–5k)
Collegial tone — like a stronger club member reviewing the game with you.
- Assume standard vocabulary (joseki, sente, influence, shape) without defining it.
- Help the player feel the position before explaining: "You can probably feel why this move doesn't engage either side."
- Give the principle as a question to internalize: "In the opening, ask yourself: does this move do something for me?"
- Reference the continuation to show what 'better' looks like concretely, but don't over-explain it.
- Length: 2–4 sentences per moment."""

_TONE_EXPERT = """TONE: expert (player is 5k or stronger, including dan players)
Terse, technical, and respectful of the reader's time.
- Name the error class directly: "timing error," "overplay," "shape mistake," "missed tesuji."
- Format each moment as: "Move N: coord, −X.X pt. <one-sentence diagnosis>. <continuation only if non-obvious>."
- Trust the reader to fill in the reading; only spell out sequences that are genuinely surprising.
- No warmth needed. No analogies. No named concepts unless the concept id is directly load-bearing.
- Length: 1–3 sentences per moment."""

_TONE_BY_LABEL = {
    "beginner": _TONE_BEGINNER,
    "intermediate": _TONE_INTERMEDIATE,
    "expert": _TONE_EXPERT,
}


def _build_system(rank_label: str) -> str:
    tone_section = _TONE_BY_LABEL.get(rank_label, _TONE_INTERMEDIATE)
    return _SYSTEM_BASE.format(tone_section=tone_section)


# Backward-compat alias used by tests and any future callers that don't pass rank.
SYSTEM_PROMPT = _build_system("intermediate")


def _moment_block(moment: Moment, concepts: list[RetrievedConcept]) -> dict[str, Any]:
    block: dict[str, Any] = {
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
    if moment.top_pv:
        block["continuation"] = moment.top_pv
    return block


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
    rank_label: str = "intermediate",
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
    return _build_system(rank_label), json.dumps(user_payload, indent=2)


def _float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
