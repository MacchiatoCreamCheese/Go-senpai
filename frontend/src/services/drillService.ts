import type { DrillSessionResp, DrillAnalyticsResp } from "../api";
import type { DrillSession, DrillAnalytics, SessionSummary, ThemeBreakdown } from "../types/drill";

export function computeAccuracy(correct: number, total: number): number | null {
  return total < 3 ? null : correct / total;
}

export function enrichSession(raw: DrillSessionResp): DrillSession {
  return {
    id: raw.id,
    userId: raw.user_id,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    status: raw.status,
    problemCount: raw.problem_count,
    attemptCount: raw.attempt_count,
    correctCount: raw.correct_count,
    accuracy: computeAccuracy(raw.correct_count, raw.attempt_count),
    targetProblemCount: raw.target_problem_count,
  };
}

export function buildDrillAnalytics(raw: DrillAnalyticsResp): DrillAnalytics {
  const themeBreakdown: ThemeBreakdown[] = raw.theme_breakdown.map(t => ({
    theme: t.theme,
    attempts: t.attempts,
    correct: t.correct,
    accuracy: computeAccuracy(t.correct, t.attempts),
  }));
  return {
    totalAttempts: raw.total_attempts,
    accuracy: raw.accuracy ?? computeAccuracy(
      raw.theme_breakdown.reduce((s, t) => s + t.correct, 0),
      raw.total_attempts,
    ),
    sessionsCount: raw.sessions_count,
    accuracyThisWeek: raw.accuracy_this_week,
    accuracyLastWeek: raw.accuracy_last_week,
    themeBreakdown,
  };
}

export function buildSessionSummary(session: DrillSessionResp): SessionSummary {
  let durationSeconds: number | null = null;
  if (session.finished_at && session.started_at) {
    durationSeconds = Math.round(
      (new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000,
    );
  }
  return {
    sessionId: session.id,
    totalAttempts: session.attempt_count,
    correctCount: session.correct_count,
    accuracy: computeAccuracy(session.correct_count, session.attempt_count),
    durationSeconds,
  };
}
