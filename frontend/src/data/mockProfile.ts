// ── Deterministic hash ────────────────────────────────────────────────────────

export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Avatar color (cosmetic, derived from handle string) ───────────────────────

const AVATAR_PALETTE = [
  "var(--pastel-cyan)",
  "var(--pastel-pink)",
  "var(--pastel-yellow)",
  "var(--pastel-lavender)",
  "var(--pastel-green)",
  "var(--pastel-peach)",
  "var(--pastel-mint)",
];

export function avatarColor(handle: string): string {
  if (!handle) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[handle.charCodeAt(0) % AVATAR_PALETTE.length];
}

// ── Estimated rank label (threshold table, not ELO) ───────────────────────────

export function deriveMockRank(totalGames: number): string {
  if (totalGames === 0)   return "Unranked";
  if (totalGames < 5)     return "30k (est.)";
  if (totalGames < 15)    return "20k (est.)";
  if (totalGames < 30)    return "15k (est.)";
  if (totalGames < 60)    return "10k (est.)";
  if (totalGames < 100)   return "5k (est.)";
  return "1k (est.)";
}
