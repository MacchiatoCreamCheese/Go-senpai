export type ProgressState = "viewed" | "practicing" | "mastered";

export type HistoryFilter = "all" | "wins" | "losses" | "ai" | "human";

// ── Match record ──────────────────────────────────────────────────────────────

export interface EnrichedMatch {
  id: string;
  boardSize: number;
  result: string | null;
  startedAt: string;
  opponentType: "ai" | "human";
  opponentHandle: string | null;
  playerColor: "B" | "W" | null;
  isWin: boolean | null;
  isFinished: boolean;
  endReason: "resign" | "time" | "points" | "unknown" | null;
  // opening intentionally absent — not tracked in backend
}

// ── Concept progress ──────────────────────────────────────────────────────────

export interface ConceptProgressItem {
  conceptId: string;
  title: string;
  progressState: ProgressState;
  timesTaught: number;
  lastTaughtAt: string | null;
  demonstrated: boolean;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface WeeklySeries {
  week: string;
  value: number;
}

export interface ProfileAnalyticsData {
  gamesPerWeek: WeeklySeries[] | null;
  drillsPerWeek: WeeklySeries[] | null;
  weaknessSeverityHistory: WeeklySeries[] | null;
  topStudiedConcepts: { title: string; count: number }[];
}

// ── Drill statistics ──────────────────────────────────────────────────────────

export interface DrillStats {
  totalAttempts: number;
  accuracy: number | null;
}

// ── Derived stats (used by hero) ──────────────────────────────────────────────

export interface ProfileStats {
  totalGames: number;
  finishedGames: number;
  totalConcepts: number;
  winRate: number | null;
  totalDrills: number;
}
