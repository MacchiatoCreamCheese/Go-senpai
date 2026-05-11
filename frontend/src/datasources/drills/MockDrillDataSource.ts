import type {
  ProblemT,
  DrillAttemptResp,
  DrillSessionResp,
  DrillAnalyticsResp,
  DrillStatsResponse,
} from "../../api";
import type { IDrillDataSource } from "./IDrillDataSource";
import { hashCode } from "../../data/mockProfile";

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isoAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const MOCK_THEMES = [
  "tesuji", "ladder", "net", "life_and_death", "ko",
  "joseki_punish", "capturing_race", "cutting", "endgame_tesuji",
];

const STUB_PROBLEMS: ProblemT[] = [
  {
    id: "mock-p-1",
    sgf: "(;GM[1]FF[4]SZ[9]AB[dd][ed][fd][dc]AW[ee][fe][ge][ef])",
    solution: [{ color: "B", coord: "de" }, { color: "W", coord: "df" }, { color: "B", coord: "ce" }],
    themes: ["capturing_race", "tesuji"],
    difficulty: 3,
    source: null,
  },
  {
    id: "mock-p-2",
    sgf: "(;GM[1]FF[4]SZ[9]AB[cc][cd][ce]AW[dc][ec][fc])",
    solution: [{ color: "B", coord: "bc" }, { color: "W", coord: "bb" }, { color: "B", coord: "cb" }],
    themes: ["ladder", "net"],
    difficulty: 2,
    source: null,
  },
  {
    id: "mock-p-3",
    sgf: "(;GM[1]FF[4]SZ[9]AB[ee][ef][fg]AW[ff][ge][hf])",
    solution: [{ color: "B", coord: "fe" }, { color: "W", coord: "gf" }, { color: "B", coord: "eg" }],
    themes: ["life_and_death", "cutting"],
    difficulty: 4,
    source: null,
  },
];

function mockSessionId(userId: string, i: number): string {
  const h = hashCode(`${userId}_s${i}`);
  const hex = h.toString(16).padStart(8, "0");
  return `00000000-0000-0000-${hex.slice(0, 4)}-${hex}${i.toString().padStart(4, "0")}`;
}

export class MockDrillDataSource implements IDrillDataSource {
  async getNextProblem(userId: string): Promise<ProblemT | null> {
    await delay(200 + (hashCode(userId) % 200));
    return STUB_PROBLEMS[hashCode(userId) % STUB_PROBLEMS.length];
  }

  async getProblem(problemId: string): Promise<ProblemT | null> {
    await delay(180);
    return STUB_PROBLEMS.find(p => p.id === problemId) ?? null;
  }

  async postDrillAttempt(payload: {
    user_id: string; problem_id: string; success: boolean;
    moves_played: Array<Record<string, unknown>>; hint_used: boolean;
    session_id?: string | null; is_retry?: boolean; retry_of_attempt_id?: number | null;
  }): Promise<DrillAttemptResp> {
    await delay(150);
    return {
      id: hashCode(payload.user_id + payload.problem_id + Date.now()),
      user_id: payload.user_id,
      problem_id: payload.problem_id,
      attempted_at: new Date().toISOString(),
      success: payload.success,
      session_id: payload.session_id ?? null,
      is_retry: payload.is_retry ?? false,
      retry_of_attempt_id: payload.retry_of_attempt_id ?? null,
    };
  }

  async deleteDrillSession(sessionId: string): Promise<{ deleted: boolean }> {
    await delay(120);
    return { deleted: !!sessionId };
  }

  async createDrillSession(userId: string, targetProblemCount = 5): Promise<DrillSessionResp> {
    await delay(200);
    const i = hashCode(userId + Date.now());
    return {
      id: mockSessionId(userId, i),
      user_id: userId,
      started_at: new Date().toISOString(),
      finished_at: null,
      status: "active",
      problem_count: 0,
      attempt_count: 0,
      correct_count: 0,
      target_problem_count: targetProblemCount,
    };
  }

  async finishDrillSession(sessionId: string): Promise<DrillSessionResp> {
    await delay(180);
    const h = hashCode(sessionId);
    const attempts = 3 + (h % 5);
    const correct = Math.floor(attempts * (0.5 + (h % 5) * 0.1));
    return {
      id: sessionId,
      user_id: "mock-user",
      started_at: isoAgo(0),
      finished_at: new Date().toISOString(),
      status: "finished",
      problem_count: attempts,
      attempt_count: attempts,
      correct_count: correct,
      target_problem_count: attempts,
    };
  }

  async getDrillSession(sessionId: string): Promise<DrillSessionResp> {
    await delay(160);
    const h = hashCode(sessionId);
    const attempts = 3 + (h % 5);
    const correct = Math.floor(attempts * (0.5 + (h % 4) * 0.1));
    return {
      id: sessionId,
      user_id: "mock-user",
      started_at: isoAgo(1),
      finished_at: isoAgo(0),
      status: "finished",
      problem_count: attempts,
      attempt_count: attempts,
      correct_count: correct,
      target_problem_count: attempts,
    };
  }

  async listDrillSessions(userId: string, limit = 20): Promise<DrillSessionResp[]> {
    await delay(250 + (hashCode(userId) % 150));
    const h = hashCode(userId);
    const count = Math.min(limit, 5 + (h % 3));
    return Array.from({ length: count }, (_, i) => {
      const seed = hashCode(`${userId}_session_${i}`);
      const attempts = 3 + (seed % 6);
      const correct = Math.floor(attempts * (0.4 + (seed % 6) * 0.1));
      return {
        id: mockSessionId(userId, i),
        user_id: userId,
        started_at: isoAgo(i * 2 + (seed % 3)),
        finished_at: i === 0 && (h % 3 === 0) ? null : isoAgo(i * 2),
        status: (i === 0 && h % 3 === 0 ? "active" : "finished") as "active" | "finished",
        problem_count: attempts,
        attempt_count: attempts,
        correct_count: correct,
        target_problem_count: attempts,
      };
    });
  }

  async getDrillAnalytics(userId: string): Promise<DrillAnalyticsResp> {
    await delay(300 + (hashCode(userId) % 200));
    const h = hashCode(userId);
    const sparseData = h % 10 < 3;
    if (sparseData) {
      return {
        total_attempts: h % 3,
        accuracy: null,
        sessions_count: h % 2,
        accuracy_this_week: null,
        accuracy_last_week: null,
        theme_breakdown: [],
      };
    }
    const total = 20 + (h % 40);
    const correct = Math.floor(total * (0.5 + (h % 5) * 0.06));
    const twAtt = 5 + (h % 8);
    const twCor = Math.floor(twAtt * (0.5 + (h % 4) * 0.08));
    const lwAtt = 4 + (h % 7);
    const lwCor = Math.floor(lwAtt * (0.45 + (h % 4) * 0.07));
    return {
      total_attempts: total,
      accuracy: correct / total,
      sessions_count: 3 + (h % 5),
      accuracy_this_week: twAtt >= 3 ? twCor / twAtt : null,
      accuracy_last_week: lwAtt >= 3 ? lwCor / lwAtt : null,
      theme_breakdown: MOCK_THEMES.slice(0, 4 + (h % 4)).map((theme, i) => {
        const ts = hashCode(`${userId}_${theme}_${i}`);
        const ta = 3 + (ts % 8);
        const tc = Math.floor(ta * (0.4 + (ts % 6) * 0.08));
        return { theme, attempts: ta, correct: tc };
      }),
    };
  }

  async getDrillStats(userId: string): Promise<DrillStatsResponse> {
    await delay(200);
    const h = hashCode(userId);
    const total = 15 + (h % 30);
    const correct = Math.floor(total * (0.5 + (h % 4) * 0.08));
    return {
      total_attempts: total,
      accuracy: total >= 3 ? correct / total : null,
    };
  }
}
