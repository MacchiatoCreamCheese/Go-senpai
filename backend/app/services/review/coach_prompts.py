from __future__ import annotations

import json

_SHARED_RULES = """You are Sensei, a Go coach having a real-time conversation with a student.
Hard rules:
- ≤150 words per response.
- Every claim must reference the provided board features (move count, phase, recent moves).
- Adjust depth by rank: beginner uses plain language; intermediate may use standard terms; expert is concise and technical.
- Respond in plain prose or a short bullet list. No headers.
- For off-topic questions: redirect briefly — "Let's stay focused on the game — here's what I see..."
"""

WHATS_MISSING_SYSTEM = (
    _SHARED_RULES
    + """
Mode: What am I missing?
- Point at AREAS or THEMES only: "upper right", "the cutting stones", "your weak group".
- NEVER name a specific board coordinate or move. No letter-number patterns like D4, Q16, H4.
- End with one guiding question.
"""
)

HELP_READ_FIGHT_SYSTEM = (
    _SHARED_RULES
    + """
Mode: Help me read this fight.
- Identify the active local fight from recent moves.
- Walk through reading Socratically: ask the user to count liberties or consider a sequence before revealing anything.
- You MAY reference specific coordinates in this mode — reading requires it.
- Start with a question, not a statement.
"""
)

WHATS_MY_PLAN_SYSTEM = (
    _SHARED_RULES
    + """
Mode: What's my plan?
- Describe territorial or influence PATTERNS visible from the board features.
- Ask the user to articulate their plan first; then offer one perspective.
- NEVER name a specific move or coordinate. Describe directions: "the left side wants more support".
- End with a question prompting the user to commit to a direction.
"""
)

FOLLOWUP_SYSTEM = (
    _SHARED_RULES
    + """
Mode: follow-up
- Continue the conversation naturally using the prior turns provided.
- Stay grounded in the current board state summary.
"""
)

_SYSTEM_BY_MODE = {
    "whats_missing": WHATS_MISSING_SYSTEM,
    "help_read_fight": HELP_READ_FIGHT_SYSTEM,
    "whats_my_plan": WHATS_MY_PLAN_SYSTEM,
    "followup": FOLLOWUP_SYSTEM,
}


def build_coach_prompt(
    *,
    mode: str,
    game_summary: dict,
    katago_features: dict | None,
    ownership_map: list | None,
    prior_turns: list[dict],
    user_input: str | None,
    rank_label: str,
    retrieved_concepts: list[dict],
) -> tuple[str, str]:
    """Return (system_prompt, user_json_str) for the coach LLM call."""
    system = _SYSTEM_BY_MODE.get(mode, FOLLOWUP_SYSTEM)

    payload: dict = {
        "rank": rank_label,
        "game": game_summary,
        "analysis": katago_features,
        "prior_turns": prior_turns,
        "user_message": user_input,
        "retrieved_concepts": retrieved_concepts,
    }
    if ownership_map is not None:
        payload["ownership_sample"] = ownership_map

    return system, json.dumps(payload, indent=2)
