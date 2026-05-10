import type { UserGameListItem, UserConceptItem, UserProgressResponse } from "../api";
import type {
  EnrichedMatch,
  ConceptProgressItem,
  ProfileAnalyticsData,
  ProfileStats,
  ProgressState,
} from "../types/profile";
import { getMockMatchEnrichment, MOCK_ANALYTICS_FALLBACK } from "../data/mockProfile";

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
    const { opponentType, opponentHandle, playerColor, opening } = getMockMatchEnrichment(g.id);
    const winnerColor = parseWinnerColor(g.result);
    const isWin = winnerColor === null ? null : winnerColor === playerColor;
    return {
      id: g.id,
      boardSize: g.board_size,
      result: g.result,
      startedAt: g.started_at,
      opponentType,
      opponentHandle,
      playerColor,
      opening,
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
  _games: UserGameListItem[],
  concepts: UserConceptItem[],
): ProfileAnalyticsData {
  const gamesPerWeek =
    progress.games_per_week.length > 0
      ? progress.games_per_week
      : MOCK_ANALYTICS_FALLBACK.gamesPerWeek;

  const drillsPerWeek =
    progress.drills_per_week.length > 0
      ? progress.drills_per_week
      : MOCK_ANALYTICS_FALLBACK.drillsPerWeek;

  const weaknessSeverityHistory =
    progress.top_weakness_severity_history.length > 0
      ? progress.top_weakness_severity_history
      : MOCK_ANALYTICS_FALLBACK.weaknessSeverityHistory;

  // Top studied concepts: concepts with highest times_taught
  const topStudiedConcepts = [...concepts]
    .sort((a, b) => b.times_taught - a.times_taught)
    .slice(0, 5)
    .map(c => ({ title: c.title, count: c.times_taught }));

  const hasRealConcepts = topStudiedConcepts.length > 0;

  return {
    gamesPerWeek,
    drillsPerWeek,
    weaknessSeverityHistory,
    puzzleAccuracy: MOCK_ANALYTICS_FALLBACK.puzzleAccuracy,
    avgStudyMinutesPerWeek: MOCK_ANALYTICS_FALLBACK.avgStudyMinutesPerWeek,
    topStudiedConcepts: hasRealConcepts ? topStudiedConcepts : MOCK_ANALYTICS_FALLBACK.topStudiedConcepts,
  };
}

// ── Derived stats ─────────────────────────────────────────────────────────────

export function deriveProfileStats(
  games: UserGameListItem[],
  concepts: UserConceptItem[],
  drillCount?: number,
): ProfileStats {
  const finished = games.filter(g => !!g.result);
  const enriched = enrichMatches(finished);
  const wins = enriched.filter(g => g.isWin === true).length;
  const winRate = finished.length > 0 ? wins / finished.length : null;

  return {
    totalGames: games.length,
    finishedGames: finished.length,
    totalConcepts: concepts.length,
    winRate,
    totalDrills: drillCount ?? MOCK_ANALYTICS_FALLBACK.drillsPerWeek.reduce((s, d) => s + d.value, 0),
  };
}

// ── Bookmarks (localStorage) ──────────────────────────────────────────────────

export function getBookmarkedConceptIds(): Set<string> {
  try {
    const raw = localStorage.getItem("senpai_concept_bookmarks");
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}
