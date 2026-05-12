/**
 * Best-effort repair when the coach LLM echoes JSON-style escape sequences
 * as literal two-character sequences (e.g. backslash + n) instead of real newlines.
 * Safe for Sensei prose only — not for arbitrary user-supplied code.
 */
export function decodeCoachLiteralEscapes(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

const MAX_OUTER_QUOTE_STRIPS = 3;

/** Remove one or more matching ASCII `"` wrappers (LLM sometimes emits a whole reply as one quoted string). */
export function stripOuterAsciiDoubleQuoteWrapper(text: string): string {
  let s = text.trim();
  for (let i = 0; i < MAX_OUTER_QUOTE_STRIPS; i++) {
    if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
      s = s.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return s;
}

/** In-game / streaming Ask Sensei assistant bubble: decode escapes, then light cleanup. */
export function formatSenseiAssistantDisplay(text: string): string {
  const t = stripOuterAsciiDoubleQuoteWrapper(decodeCoachLiteralEscapes(text))
    .replace(/^[ \t]*(analysis|coach note|note):\s*/gim, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_\(([\s\S]*?)\)_/g, "($1)")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}
