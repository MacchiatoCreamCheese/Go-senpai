export interface DrillSession {
  id: string;
  userId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "active" | "finished" | "abandoned";
  problemCount: number;
  attemptCount: number;
  correctCount: number;
  accuracy: number | null;
  targetProblemCount: number;
}

export interface ThemeBreakdown {
  theme: string;
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface DrillAnalytics {
  totalAttempts: number;
  accuracy: number | null;
  sessionsCount: number;
  accuracyThisWeek: number | null;
  accuracyLastWeek: number | null;
  themeBreakdown: ThemeBreakdown[];
}

export interface SessionSummary {
  sessionId: string;
  totalAttempts: number;
  correctCount: number;
  accuracy: number | null;
  durationSeconds: number | null;
}
