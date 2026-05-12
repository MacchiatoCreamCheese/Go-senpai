import type { UserGameListItem, UserConceptItem, UserProgressResponse } from "../api";
import type {
  EnrichedMatch,
  ConceptProgressItem,
  ProfileAnalyticsData,
  ProgressState,
} from "../types/profile";

// ── Match enrichment ──────────────────────────────────────────────────────────

function parseWinnerColor(result: string | null): "B" | "W" | null {
  if (!result) return null;
  if (result.startsWith("B")) return "B";
  if (result.startsWith("W")) return "W";
  return null;
}

function parseEndReason(result: string | null): "resign" | "time" | "points" | "unknown" | null {
  if (!result) return null;
  if (result.includes("+R")) return "resign";
  if (result.includes("+T")) return "time";
  if (/[+-]\d/.test(result)) return "points";
  return "unknown";
}

export function enrichMatches(games: UserGameListItem[]): EnrichedMatch[] {
  return games.map(g => {
    const winnerColor = parseWinnerColor(g.result);
    const isWin =
      winnerColor === null || g.player_color === null
        ? null
        : winnerColor === g.player_color;
    return {
      id: g.id,
      boardSize: g.board_size,
      result: g.result,
      startedAt: g.started_at,
      opponentType: g.opponent_type,
      opponentHandle: g.opponent_handle,
      playerColor: g.player_color,
      isWin,
      isFinished: !!g.result,
      endReason: parseEndReason(g.result),
    };
  });
}

// ── Concept progress ──────────────────────────────────────────────────────────

function deriveProgressState(item: UserConceptItem): ProgressState {
  if (item.demonstrated) return "mastered";
  if (item.times_taught >= 2) return "practicing";
  return "viewed";
}

export function toConceptProgress(items: UserConceptItem[]): ConceptProgressItem[] {
  return items.map(c => ({
    conceptId: c.concept_id,
    title: c.title,
    progressState: deriveProgressState(c),
    timesTaught: c.times_taught,
    lastTaughtAt: c.last_taught_at,
    demonstrated: c.demonstrated,
  }));
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export function buildAnalytics(
  progress: UserProgressResponse,
  concepts: UserConceptItem[],
): ProfileAnalyticsData {
  // Require ≥ 2 data points to show a trend chart; a single point is not meaningful.
  const gamesPerWeek             = progress.games_per_week.length > 1             ? progress.games_per_week             : null;
  const drillsPerWeek            = progress.drills_per_week.length > 1            ? progress.drills_per_week            : null;
  const weaknessSeverityHistory  = progress.top_weakness_severity_history.length > 1 ? progress.top_weakness_severity_history : null;

  const topStudiedConcepts = [...concepts]
    .sort((a, b) => b.times_taught - a.times_taught)
    .slice(0, 5)
    .map(c => ({ title: c.title, count: c.times_taught }));

  const lastWeekDrillCount = progress.drills_per_week.length > 0
    ? progress.drills_per_week[progress.drills_per_week.length - 1].value
    : null;
  const lastWeekGameCount = progress.games_per_week.length > 0
    ? progress.games_per_week[progress.games_per_week.length - 1].value
    : null;

  return {
    gamesPerWeek,
    drillsPerWeek,
    weaknessSeverityHistory,
    topStudiedConcepts,
    lastWeekDrillCount,
    lastWeekGameCount,
  };
}
