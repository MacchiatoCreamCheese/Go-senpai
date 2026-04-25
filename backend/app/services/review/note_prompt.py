from __future__ import annotations

import json
from typing import Any

NOTE_SYSTEM = """You are a Go coach writing a short per-move note.

Hard rules:
- 80–120 words total.
- Reference the provided move features (coord, top_move, points_lost, phase).
  Do not invent coordinates or outcomes.
- If a continuation is provided, reference the first 1–2 moves explicitly.
- Use at most one retrieved concept id (the most relevant; omit if none fit well).
- Return ONLY a JSON object, no prose around it:
  {"body_md": "<note text>", "concept_ids": ["<id>"]}

TONE — read the "rank" field and follow the matching style exactly:

beginner (>15k):
  Open with what happened in human terms ("this was the moment the game
  started slipping"). Plain language only — define any Go term you use
  ("joseki (the standard corner sequence)"). Use a spatial analogy if it
  helps. Tell the continuation as a short story: "if White enters at X,
  you answer Y and your side stays intact." Close with one named takeaway:
  "Concept: prefer big moves over safe ones in the opening."

intermediate (15k–5k):
  Collegial, like a stronger club member. Assume vocabulary (sente, joseki,
  influence). Help the player feel the position first ("you can probably feel
  why this move doesn't engage either side"), then give the principle as a
  question: "In the opening, ask: does this move do something for me?"
  Reference the continuation to show what 'better' looks like concretely.

expert (<5k / dan):
  Terse and technical. Name the error class ("timing error", "overplay",
  "shape mistake"). Format: "Move N: coord, −X.X pt. <one-sentence
  diagnosis>. <continuation only if non-obvious>." No analogies. No
  hand-holding.
"""


def build_note_prompt(
    *,
    feature: dict[str, Any],
    concepts: list[dict[str, str]],
    rank_label: str,
) -> tuple[str, str]:
    """Return (system, user) strings for a single-move coaching note."""
    user = json.dumps(
        {
            "rank": rank_label,
            "move": {
                "move_number": feature["move_number"],
                "color": feature["color"],
                "played_coord": feature["coord"],
                "top_move": feature.get("top_move"),
                "points_lost": round(float(feature.get("points_lost") or 0), 2),
                "winrate_before": _pct(feature.get("winrate_before")),
                "winrate_after": _pct(feature.get("winrate_after")),
                "phase": feature.get("phase"),
                "continuation": (feature.get("top_pv") or [])[:4],
            },
            "retrieved_concepts": concepts,
        },
        indent=2,
    )
    return NOTE_SYSTEM, user


def _pct(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return round(float(v) * 100, 1)
    except (TypeError, ValueError):
        return None
