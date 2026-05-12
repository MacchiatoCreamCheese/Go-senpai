"""Normalize LLM coach prose for storage and API responses."""

from __future__ import annotations


def decode_coach_literal_escapes(s: str) -> str:
    """Repair prose that echoed JSON string escapes as visible two-char sequences."""
    return (
        s.replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\\\", "\\")
    )


def strip_outer_ascii_double_quote_wrapper(s: str) -> str:
    """Remove matching ASCII `"` wrappers (whole reply emitted as one quoted string)."""
    s = s.strip()
    for _ in range(3):
        if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
            s = s[1:-1].strip()
        else:
            break
    return s


def normalize_coach_assistant_text(s: str) -> str:
    """Decode accidental escapes, then strip redundant outer double quotes."""
    return strip_outer_ascii_double_quote_wrapper(decode_coach_literal_escapes(s))
