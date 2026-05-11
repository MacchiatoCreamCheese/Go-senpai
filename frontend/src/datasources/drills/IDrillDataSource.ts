import type {
  ProblemT,
  DrillAttemptResp,
  DrillSessionResp,
  DrillAnalyticsResp,
  DrillStatsResponse,
} from "../../api";

export interface IDrillDataSource {
  getNextProblem(userId: string): Promise<ProblemT | null>;
  getProblem(problemId: string): Promise<ProblemT | null>;
  postDrillAttempt(payload: {
    user_id: string;
    problem_id: string;
    success: boolean;
    moves_played: Array<Record<string, unknown>>;
    hint_used: boolean;
    session_id?: string | null;
    is_retry?: boolean;
    retry_of_attempt_id?: number | null;
  }): Promise<DrillAttemptResp>;
  createDrillSession(userId: string, targetProblemCount?: number): Promise<DrillSessionResp>;
  finishDrillSession(sessionId: string): Promise<DrillSessionResp>;
  deleteDrillSession(sessionId: string): Promise<{ deleted: boolean }>;
  getDrillSession(sessionId: string): Promise<DrillSessionResp>;
  listDrillSessions(userId: string, limit?: number): Promise<DrillSessionResp[]>;
  getDrillAnalytics(userId: string): Promise<DrillAnalyticsResp>;
  getDrillStats(userId: string): Promise<DrillStatsResponse>;
}
