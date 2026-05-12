from __future__ import annotations

import json

_SHARED_RULES = """You are Sensei, a Go coach having a real-time conversation with a student.
Hard rules:
- ≤150 words per response.
- Every claim must reference the provided board features (move count, phase, recent moves).
- Respond in plain prose or a short bullet list. No headers.
- For off-topic questions: redirect briefly — "Let's stay focused on the game — here's what I see..."
- If "student_context" is present: reference the student's top weaknesses and recent concepts
  naturally when relevant. For example, if they have a "blunder middlegame" weakness and you see
  a tactical slip, connect it. If a concept they recently studied appears in the position, note
  it — "you've been working on this pattern." Never list the context mechanically.

TONE — match the "rank" field exactly:

beginner (>15k):
  Warm and patient. Plain language; define every Go term you use. Use spatial
  analogies ("claiming this area is like planting a flag"). End with one named
  principle. Never just name a problem — always explain why it matters.

intermediate (15k–5k):
  Collegial. Assume vocabulary (sente, joseki, influence, thickness). Help the
  player feel the position before explaining it. Give principles as questions to
  internalize: "Does this move do something for you?"

expert (<5k / dan):
  Terse. Name error classes directly ("overplay", "timing error", "gote shape").
  Trust the reader; skip obvious reading. One sentence per observation.
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
    user_learning_context: dict | None = None,
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
    if user_learning_context:
        payload["student_context"] = user_learning_context
    if ownership_map is not None:
        payload["ownership_sample"] = ownership_map

    return system, json.dumps(payload, indent=2)


GENERAL_CHAT_SYSTEM = """You are Sensei, a Go coach and mentor having a conversation with a student.
Hard rules:
- ≤150 words per response.
- Respond in plain prose only. Never output JSON or any structured data format.
- Be warm, specific, and reference the student's actual weakness data when relevant.
- No Go board coordinates in general advice.
- If the student asks about their weakness, name the specific themes from student_weaknesses.
- If asked for recommendations, base them on the weakness profile provided.
- For off-topic questions: briefly redirect — "Let's keep focused on your Go journey!"

TONE: Encouraging for beginners, direct and collegial for intermediate/advanced.
"""


def _clean_turns(turns: list[dict]) -> list[dict]:
    """Convert DB rows to plain {role, content} pairs for conversation history."""
    result = []
    for t in turns:
        role = t.get("role", "user")
        content = t.get("user_input") if role == "user" else t.get("assistant_output_md")
        if content:
            result.append({"role": role, "content": content})
    return result


def build_general_chat_prompt(
    *,
    message: str,
    weaknesses: list[dict],
    concepts_seen: list[dict],
    prior_turns: list[dict],
) -> tuple[str, str]:
    """Return (system_prompt, user_text) for the general (non-game) sensei chat.

    Context goes into the system prompt; the user message is plain prose so the
    LLM never sees JSON and cannot mirror a structured format in its reply.
    """
    weakness_lines = [
        f"  - {w['theme'].replace('_', ' ')} (severity {round(float(w.get('severity') or 0), 2)})"
        for w in weaknesses[:5]
        if float(w.get("severity") or 0) > 0
    ]
    concept_lines = [
        f"  - {c['concept_id'].replace('_', ' ')} (taught {c['times_taught']} time{'s' if c['times_taught'] != 1 else ''})"
        for c in concepts_seen[:5]
    ]

    profile_sections: list[str] = []
    if weakness_lines:
        profile_sections.append("Student weaknesses:\n" + "\n".join(weakness_lines))
    if concept_lines:
        profile_sections.append("Concepts recently studied:\n" + "\n".join(concept_lines))

    system = GENERAL_CHAT_SYSTEM
    if profile_sections:
        system += "\n\nSTUDENT PROFILE (reference naturally when relevant):\n" + "\n\n".join(profile_sections)

    # Format conversation history as plain dialogue, not JSON
    history_lines = [
        f"{'Student' if t['role'] == 'user' else 'Sensei'}: {t['content']}"
        for t in _clean_turns(prior_turns[-8:])
    ]

    if history_lines:
        user_prompt = "\n".join(history_lines) + f"\nStudent: {message}"
    else:
        user_prompt = message

    return system, user_prompt
