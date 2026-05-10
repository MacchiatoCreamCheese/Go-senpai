export type ProgressState = "viewed" | "practicing" | "mastered";

export type HistoryFilter = "all" | "wins" | "losses" | "ai" | "human";

// ── Match record ──────────────────────────────────────────────────────────────

export interface EnrichedMatch {
  id: string;
  boardSize: number;
  result: string | null;
  startedAt: string;
  // enriched fields
  opponentType: "ai" | "human";
  opponentHandle: string;
  playerColor: "B" | "W";
  opening: string | null;
  isWin: boolean | null;
  isFinished: boolean;
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
  gamesPerWeek: WeeklySeries[];
  drillsPerWeek: WeeklySeries[];
  weaknessSeverityHistory: WeeklySeries[];
  puzzleAccuracy: number;
  avgStudyMinutesPerWeek: number;
  topStudiedConcepts: { title: string; count: number }[];
}

// ── Derived stats (used by hero) ──────────────────────────────────────────────

export interface ProfileStats {
  totalGames: number;
  finishedGames: number;
  totalConcepts: number;
  winRate: number | null;
  totalDrills: number;
}
