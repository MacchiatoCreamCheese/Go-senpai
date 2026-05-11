import {
  getNextProblem,
  getProblem,
  postDrillAttempt,
  createDrillSession,
  finishDrillSession,
  deleteDrillSession as apiDeleteDrillSession,
  getDrillSession,
  listDrillSessions,
  getDrillAnalytics,
  getDrillStats,
} from "../../api";
import type { IDrillDataSource } from "./IDrillDataSource";

export class ApiDrillDataSource implements IDrillDataSource {
  getNextProblem(userId: string) { return getNextProblem(userId); }
  getProblem(problemId: string) { return getProblem(problemId); }
  postDrillAttempt(payload: Parameters<typeof postDrillAttempt>[0]) { return postDrillAttempt(payload); }
  createDrillSession(userId: string, targetProblemCount?: number) { return createDrillSession(userId, targetProblemCount); }
  finishDrillSession(sessionId: string) { return finishDrillSession(sessionId); }
  deleteDrillSession(sessionId: string) { return apiDeleteDrillSession(sessionId); }
  getDrillSession(sessionId: string) { return getDrillSession(sessionId); }
  listDrillSessions(userId: string, limit?: number) { return listDrillSessions(userId, limit); }
  getDrillAnalytics(userId: string) { return getDrillAnalytics(userId); }
  getDrillStats(userId: string) { return getDrillStats(userId); }
}
