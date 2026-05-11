import type { IDrillDataSource } from "../datasources/drills/IDrillDataSource";
import type {
  ProblemT,
  DrillAttemptResp,
  DrillSessionResp,
  DrillAnalyticsResp,
  DrillStatsResponse,
} from "../api";
import { drillDataSource } from "../datasources/drills";

export interface IDrillRepository {
  getNextProblem(userId: string): Promise<ProblemT | null>;
  getProblem(problemId: string): Promise<ProblemT | null>;
  postDrillAttempt(payload: {
    user_id: string; problem_id: string; success: boolean;
    moves_played: Array<Record<string, unknown>>; hint_used: boolean;
    session_id?: string | null; is_retry?: boolean; retry_of_attempt_id?: number | null;
  }): Promise<DrillAttemptResp>;
  createDrillSession(userId: string, targetProblemCount?: number): Promise<DrillSessionResp>;
  finishDrillSession(sessionId: string): Promise<DrillSessionResp>;
  deleteDrillSession(sessionId: string): Promise<{ deleted: boolean }>;
  getDrillSession(sessionId: string): Promise<DrillSessionResp>;
  listDrillSessions(userId: string, limit?: number): Promise<DrillSessionResp[]>;
  getDrillAnalytics(userId: string): Promise<DrillAnalyticsResp>;
  getDrillStats(userId: string): Promise<DrillStatsResponse>;
}

class DrillRepository implements IDrillRepository {
  constructor(private readonly ds: IDrillDataSource) {}
  getNextProblem(userId: string) { return this.ds.getNextProblem(userId); }
  getProblem(problemId: string) { return this.ds.getProblem(problemId); }
  postDrillAttempt(payload: Parameters<IDrillDataSource["postDrillAttempt"]>[0]) { return this.ds.postDrillAttempt(payload); }
  createDrillSession(userId: string, targetProblemCount?: number) { return this.ds.createDrillSession(userId, targetProblemCount); }
  finishDrillSession(sessionId: string) { return this.ds.finishDrillSession(sessionId); }
  deleteDrillSession(sessionId: string) { return this.ds.deleteDrillSession(sessionId); }
  getDrillSession(sessionId: string) { return this.ds.getDrillSession(sessionId); }
  listDrillSessions(userId: string, limit?: number) { return this.ds.listDrillSessions(userId, limit); }
  getDrillAnalytics(userId: string) { return this.ds.getDrillAnalytics(userId); }
  getDrillStats(userId: string) { return this.ds.getDrillStats(userId); }
}

export const drillRepository: IDrillRepository = new DrillRepository(drillDataSource);
