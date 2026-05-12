import type { DrillSessionResp, DrillAnalyticsResp, WeaknessItem, ProblemT } from "../api";
import type { DrillSession, DrillAnalytics, SessionSummary, ThemeBreakdown } from "../types/drill";

// ── Theme / weakness mappings ─────────────────────────────────────────────────

export const PROBLEM_TO_WEAKNESS: Record<string, string[]> = {
  opening_shape:  ["blunder_opening", "low_consistency_opening"],
  joseki_punish:  ["blunder_opening"],
  capturing_race: ["blunder_middlegame"],
  cutting:        ["blunder_middlegame"],
  sabaki:         ["blunder_middlegame"],
  endgame_tesuji: ["blunder_endgame", "low_consistency_endgame"],
  counting:       ["blunder_endgame"],
  tesuji:         ["ignored_top_move"],
  shape:          ["ignored_top_move"],
};

const WEAKNESS_LABEL: Record<string, string> = {
  blunder_opening:         "opening mistakes",
  blunder_middlegame:      "middlegame fights",
  blunder_endgame:         "endgame precision",
  ignored_top_move:        "recognizing key moves",
  low_consistency_opening: "consistent opening play",
  low_consistency_endgame: "consistent endgame technique",
};

const GOAL_BY_THEME: Record<string, string> = {
  capturing_race: "Find the only sequence that wins the capturing race.",
  tesuji:         "Find the tesuji — there is exactly one correct move.",
  cutting:        "Exploit the cut to gain a decisive positional advantage.",
  opening_shape:  "Choose the vital shape point that keeps your stones efficient.",
  joseki_punish:  "Punish the joseki deviation with precise, forcing play.",
  endgame_tesuji: "Find the endgame tesuji that maximizes your territory.",
  counting:       "Count accurately and make the correct strategic decision.",
  sabaki:         "Find the sequence that achieves light, flexible shape.",
  shape:          "Choose the vital point — good shape prevents future weaknesses.",
};

const FAILURE_HINT: Record<string, string> = {
  capturing_race: "Liberty count is everything here. Count each group's liberties before committing to a sequence.",
  tesuji:         "A tesuji usually creates two threats simultaneously. Look for the move your opponent cannot answer.",
  cutting:        "Check whether your cut leaves any of your own stones short of liberties.",
  opening_shape:  "Shape points are often non-intuitive. Ask where the empty triangle and bamboo joint are.",
  joseki_punish:  "Joseki punishments are forcing — identify which of your opponent's stones are overextended.",
  endgame_tesuji: "Endgame tesujis often involve a diagonal or throw-in that looks small but gains extra points.",
  counting:       "Break the position into separate territories and add them carefully before deciding.",
  sabaki:         "Sabaki is about keeping options open. Avoid moves that make your stones heavy.",
  shape:          "Avoid empty triangles and dumpling shapes. Look for the move that connects most efficiently.",
};

function formatTheme(theme: string): string {
  return theme.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Generation functions ──────────────────────────────────────────────────────

export function generateWhyExplanation(
  problem: ProblemT,
  weaknesses: WeaknessItem[],
  themeAccuracy: ThemeBreakdown[],
): string {
  const matching = weaknesses
    .filter((w) => problem.themes.some((t) => PROBLEM_TO_WEAKNESS[t]?.includes(w.theme)))
    .sort((a, b) => b.severity - a.severity);

  const topW = matching[0];
  const themeLabel = formatTheme(problem.themes[0] ?? "tsumego");
  const seed = problem.id.charCodeAt(0) % 3;

  if (topW && topW.severity >= 0.55) {
    const label = WEAKNESS_LABEL[topW.theme] ?? themeLabel.toLowerCase();
    const count = topW.evidence_count;
    const countPhrase = count > 1 ? ` flagged across ${count} recent games` : "";
    const templates = [
      `Sensei identified ${label} as a priority weakness${countPhrase}. This puzzle directly targets that gap — solve it without hints to build the correct reflex.`,
      `Your recent games show a pattern of ${label}. Repeated exposure to these positions converts study into instinct.`,
      `${label.charAt(0).toUpperCase() + label.slice(1)} is your highest-impact improvement area right now. This puzzle puts you in exactly that situation.`,
    ];
    return templates[seed];
  }

  const weakTheme = themeAccuracy
    .filter((t) => problem.themes.includes(t.theme) && t.accuracy != null && t.accuracy < 0.55)
    .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1))[0];

  if (weakTheme) {
    const label = weakTheme.theme.replace(/_/g, " ");
    const acc = Math.round((weakTheme.accuracy ?? 0) * 100);
    return `Your drill accuracy on ${label} is ${acc}% — below your average. This problem gives you focused repetition in that area.`;
  }

  const fallbacks = [
    `This problem trains ${themeLabel}. Solving it without hints strengthens the tactical pattern in your muscle memory.`,
    `${themeLabel} positions appear regularly in real games. Consistent drill on this theme converts study into instinct.`,
    `Repeated exposure to ${themeLabel} builds the reading speed you need when these positions arise under time pressure.`,
  ];
  return fallbacks[seed];
}

export function generateGoalText(themes: string[], toPlay: "B" | "W"): string {
  for (const t of themes) {
    if (GOAL_BY_THEME[t]) return GOAL_BY_THEME[t];
  }
  return `Find the correct sequence. ${toPlay === "B" ? "Black" : "White"} to play and achieve the objective.`;
}

export function generateFailureHint(themes: string[]): string | null {
  for (const t of themes) {
    if (FAILURE_HINT[t]) return FAILURE_HINT[t];
  }
  return null;
}

export function difficultyLabel(d: number): { label: string; tier: "easy" | "medium" | "hard" } {
  if (d <= 3) return { label: "Easy", tier: "easy" };
  if (d <= 6) return { label: "Medium", tier: "medium" };
  return { label: "Hard", tier: "hard" };
}

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
