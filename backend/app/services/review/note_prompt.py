from __future__ import annotations

import json
from typing import Any

NOTE_SYSTEM = """You are a Go coach writing a short per-move note.
Rules:
- 80-120 words total.
- Reference exactly the provided move features (move_number, coord, top_move,
  points_lost, winrate drop, phase). Do not invent coordinates or outcomes.
- If a continuation is provided, reference the first 1-2 moves explicitly.
- Use at most one retrieved concept id (pick the most relevant; omit if none fit).
- Tone: coaching, not autopsy. Focus on the idea to remember, not the mistake.
- Adjust depth to the player's rank:
    beginner: plain language, no Japanese terms.
    intermediate: standard terms OK, brief explanation.
    expert: concise, technical vocabulary assumed.
- Return ONLY a JSON object with no prose around it:
  {"body_md": "<note text>", "concept_ids": ["<id>"]}
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
