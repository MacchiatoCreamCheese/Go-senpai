import type { WeeklySeries } from "../types/profile";

// ── Constants ─────────────────────────────────────────────────────────────────

const MOCK_AI_HANDLES = [
  "Sensei AI", "Go Sensei", "Sensei AI", "Go Sensei", "Sensei AI",
];

const MOCK_HUMAN_HANDLES = [
  "TakahashiGo", "stonecutter", "joseki_jun", "yuki_dan", "kato_ryusei",
  "hoshi_player", "weiqi_fan", "amateurgame", "ninestar", "badukmaster",
];

const MOCK_OPENINGS = [
  "Chinese Opening", "Kobayashi Opening", "Sanrensei",
  "Mini-Chinese", "Orthodox Opening", "4-4 Corner",
  "3-3 Invasion", "Low Chinese", "Nirensei",
  "Takemiya Cosmic", null, null, null,
];

// ── Deterministic hash ────────────────────────────────────────────────────────

export function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Match enrichment ──────────────────────────────────────────────────────────

export function getMockMatchEnrichment(gameId: string): {
  opponentType: "ai" | "human";
  opponentHandle: string;
  playerColor: "B" | "W";
  opening: string | null;
} {
  const h = hashCode(gameId);
  const opponentType: "ai" | "human" = h % 3 === 0 ? "human" : "ai";
  const opponentHandle =
    opponentType === "ai"
      ? MOCK_AI_HANDLES[h % MOCK_AI_HANDLES.length]
      : MOCK_HUMAN_HANDLES[h % MOCK_HUMAN_HANDLES.length];
  const playerColor: "B" | "W" = h % 2 === 0 ? "B" : "W";
  const opening = MOCK_OPENINGS[h % MOCK_OPENINGS.length];
  return { opponentType, opponentHandle, playerColor, opening };
}

// ── Mock analytics fallback (used when backend returns empty arrays) ───────────

function buildWeeks(count: number, baseValue: number, variance: number): WeeklySeries[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (count - 1 - i) * 7);
    const year = d.getFullYear();
    const week = Math.ceil(((d.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + 1) / 7);
    const noise = (Math.sin(i * 7.3 + baseValue) + 1) * variance;
    return { week: `${year}-W${String(week).padStart(2, "0")}`, value: Math.max(0, baseValue + noise) };
  });
}

export const MOCK_ANALYTICS_FALLBACK = {
  gamesPerWeek: buildWeeks(10, 2.5, 1.8),
  drillsPerWeek: buildWeeks(10, 4.0, 2.2),
  weaknessSeverityHistory: buildWeeks(10, 0.55, 0.15),
  puzzleAccuracy: 0.67,
  avgStudyMinutesPerWeek: 42,
  topStudiedConcepts: [
    { title: "Ladder", count: 8 },
    { title: "Life and Death", count: 6 },
    { title: "Empty Triangle", count: 5 },
    { title: "Net (Geta)", count: 4 },
    { title: "Ko", count: 3 },
  ],
};

// ── Avatar colors ─────────────────────────────────────────────────────────────

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

// ── Mock rank label derived from game history ─────────────────────────────────

export function deriveMockRank(totalGames: number): string {
  if (totalGames === 0) return "Unranked";
  if (totalGames < 5) return "30k";
  if (totalGames < 15) return "20k";
  if (totalGames < 30) return "15k";
  if (totalGames < 60) return "10k";
  if (totalGames < 100) return "5k";
  return "1k";
}
