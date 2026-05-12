import type { ColorCode, GameT, GameStateT, MoveKind, PointT } from "./types";
import { api } from "./lib/http";
export { api } from "./lib/http";
export type { ColorCode } from "./types";

async function asJson<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const text = await resp.text();
    let detail = text;
    try {
      const j = JSON.parse(text) as { detail?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
    } catch {
      /* use raw body */
    }
    throw new Error(detail || `${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

export interface UserT {
  id: string;
  handle: string;
}

export async function updateMyHandle(handle: string): Promise<UserT> {
  const resp = await api("/api/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  return asJson<UserT>(resp);
}

export async function updateHandleByUserId(userId: string, handle: string): Promise<UserT> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/handle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  return asJson<UserT>(resp);
}

export async function createUser(handle: string): Promise<UserT> {
  const resp = await api("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  return asJson<UserT>(resp);
}

export async function fetchUser(userId: string): Promise<UserT> {
  return asJson<UserT>(await api(`/api/users/${encodeURIComponent(userId)}`));
}

export interface CreateGameOpts {
  opponentType?: "human" | "ai";
  aiRank?: number;
  trainingMode?: boolean;
}

export async function createGame(
  size: 9 | 13 | 19,
  userId: string,
  color: ColorCode,
  opts: CreateGameOpts = {},
): Promise<GameT> {
  const body: Record<string, unknown> = { size, user_id: userId, color };
  if (opts.opponentType === "ai") {
    body.opponent_type = "ai";
    body.ai_rank = opts.aiRank;
    body.training_mode = opts.trainingMode ?? false;
  }
  const resp = await api("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return asJson<GameT>(resp);
}

export async function requestAiMove(id: string): Promise<GameStateT> {
  const resp = await api(`/api/games/${id}/ai-move`, { method: "POST" });
  return asJson<GameStateT>(resp);
}

export async function undoMove(id: string): Promise<GameStateT> {
  const resp = await api(`/api/games/${id}/undo`, { method: "POST" });
  return asJson<GameStateT>(resp);
}

export async function swapColors(id: string): Promise<GameT> {
  const resp = await api(`/api/games/${id}/swap_colors`, { method: "POST" });
  return asJson<GameT>(resp);
}

export async function fetchGame(id: string): Promise<GameT> {
  return asJson<GameT>(await api(`/api/games/${id}`));
}

export async function joinGame(id: string, userId: string): Promise<GameT> {
  const resp = await api(`/api/games/${id}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  return asJson<GameT>(resp);
}

// ─── Coach session / turns ─────────────────────────────

export interface CoachTurn {
  role: string;
  invocation_mode?: string | null;
  user_input?: string | null;
  assistant_output_md?: string | null;
}

export async function createCoachSession(
  gameId: string,
  userId?: string,
): Promise<{ session_id: string }> {
  const body: Record<string, unknown> = { game_id: gameId };
  if (userId) body.user_id = userId;
  const resp = await api("/api/coaches/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return asJson<{ session_id: string }>(resp);
}

export async function getCoachTurns(sessionId: string, limit = 100): Promise<CoachTurn[]> {
  const resp = await api(
    `/api/coaches/sessions/${encodeURIComponent(sessionId)}/turns?limit=${limit}`,
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.turns as CoachTurn[];
}

export async function appendCoachTurn(
  sessionId: string,
  payload: {
    role: string;
    mode: string;
    user_input?: string | null;
    assistant_output_md?: string | null;
  },
): Promise<void> {
  await api(`/api/coaches/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function playMove(
  id: string,
  color: ColorCode,
  kind: MoveKind,
  point: PointT | null,
): Promise<GameStateT> {
  const resp = await api(`/api/games/${id}/moves`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color, kind, point }),
  });
  return asJson<GameStateT>(resp);
}

export interface UserGameListItem {
  id: string;
  board_size: number;
  result: string | null;
  started_at: string;
  player_color: "B" | "W" | null;
  opponent_type: "human" | "ai";
  opponent_handle: string | null;
}

export async function getMyGames(userId: string): Promise<UserGameListItem[]> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/games`);
  if (!resp.ok) return [];
  return asJson<UserGameListItem[]>(resp);
}

export function sgfUrl(id: string): string {
  return `/api/games/${id}/sgf`;
}

// ─── Analysis (Phase 1 backend) ────────────────────────────
export type Phase = "opening" | "middlegame" | "endgame";

export interface MoveFeature {
  move_number: number;
  color: ColorCode;
  coord: string;
  points_lost: number | null;
  policy_rank: number | null;
  top_move: string | null;
  winrate_before: number | null;
  winrate_after: number | null;
  score_before: number | null;
  score_after: number | null;
  phase: Phase;
  is_blunder: boolean;
  top_pv?: string[] | null;
}

export interface AnalysisResponse {
  game_id: string;
  features: MoveFeature[];
}

export async function getGameAnalysis(id: string): Promise<AnalysisResponse | null> {
  const resp = await api(`/api/games/${id}/analysis`);
  if (resp.status === 404) return null;
  return asJson<AnalysisResponse>(resp);
}

export interface AnalyzeResponse {
  game_id: string;
  move_count: number;
  visits: number;
  katago_version: string;
  model_name: string;
  cached: boolean;
  cache_hits?: number;
}

export async function triggerAnalyze(id: string, force = false): Promise<AnalyzeResponse> {
  const url = `/api/games/${id}/analyze${force ? "?force=true" : ""}`;
  return asJson<AnalyzeResponse>(await api(url, { method: "POST" }));
}

// ─── Review (Phase 2 backend) ──────────────────────────────
export interface ReviewMoment {
  move_number: number;
  coord: string;
  color: ColorCode;
  top_move: string | null;
  points_lost: number;
  phase: Phase;
  /** Severity tier the backend assigned: "blunder" | "mistake" | "inaccuracy" | etc. */
  kind: string;
  explanation_md: string;
  concept_ids: string[];
  top_pv?: string[] | null;
}

export interface ReviewResponse {
  id: string;
  game_id: string;
  for_user_id: string;
  generated_at: string;
  model: string;
  summary_md: string;
  moments: ReviewMoment[];
  cost_tokens: number | null;
}

export async function getReview(gameId: string, forUserId: string): Promise<ReviewResponse | null> {
  const resp = await api(`/api/games/${gameId}/review?for_user_id=${encodeURIComponent(forUserId)}`);
  if (resp.status === 404) return null;
  return asJson<ReviewResponse>(resp);
}

// ─── Phase 4: weaknesses, agent loop, drills ───────────────
export interface WeaknessItem {
  theme: string;
  severity: number;
  evidence_count: number;
  last_seen_at: string | null;
  latest_insight: string | null;
}

export async function getWeaknesses(userId: string): Promise<WeaknessItem[]> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/weaknesses`);
  if (!resp.ok) return [];
  return asJson<WeaknessItem[]>(resp);
}

export interface ConceptT {
  id: string;
  title: string;
  body_md: string;
  tags: string[];
}

export interface ProblemT {
  id: string;
  sgf: string;
  solution: Array<Record<string, unknown>>;
  themes: string[];
  difficulty: number;
  source: string | null;
}

export type NextActionKind =
  | "review_game"
  | "teach_concept"
  | "revisit_concept"
  | "serve_drill"
  | "idle";

export interface NextActionResponse {
  kind: NextActionKind;
  game_id?: string;
  problem?: ProblemT;
  concept?: ConceptT;
  reason?: string;
}

export interface ActionHistoryItem {
  id: number;
  kind: NextActionKind | string;
  game_id?: string;
  problem_id?: string;
  concept_id?: string;
  reason?: string;
  picked_at: string;
}

export async function getActionHistory(userId: string, limit = 20): Promise<ActionHistoryItem[]> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/action-history?limit=${limit}`);
  if (!resp.ok) return [];
  return asJson<ActionHistoryItem[]>(resp);
}

export async function getNextAction(userId: string): Promise<NextActionResponse> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/next-action`, {
    method: "POST",
  });
  return asJson<NextActionResponse>(resp);
}

export async function getNextProblem(userId: string): Promise<ProblemT | null> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/next-problem`);
  if (resp.status === 404) return null;
  return asJson<ProblemT>(resp);
}

export async function getProblem(problemId: string): Promise<ProblemT | null> {
  const resp = await api(`/api/problems/${encodeURIComponent(problemId)}`);
  if (resp.status === 404) return null;
  return asJson<ProblemT>(resp);
}

export interface MoveNote {
  tier: "yellow" | "red";
  body_md: string;
  concept_ids: string[];
  model: string;
  generated_at: string;
}

export async function getMoveNote(
  gameId: string,
  moveNumber: number,
  forUserId: string,
): Promise<MoveNote> {
  const resp = await api(
    `/api/games/${encodeURIComponent(gameId)}/moves/${moveNumber}/note?for_user_id=${encodeURIComponent(forUserId)}`,
  );
  if (!resp.ok) throw new Error(`${resp.status}`);
  return resp.json() as Promise<MoveNote>;
}

export interface DrillAttemptResp {
  id: number;
  user_id: string;
  problem_id: string;
  attempted_at: string;
  success: boolean;
  session_id: string | null;
  is_retry?: boolean;
  retry_of_attempt_id?: number | null;
}

export async function postDrillAttempt(payload: {
  user_id: string;
  problem_id: string;
  success: boolean;
  moves_played: Array<Record<string, unknown>>;
  hint_used: boolean;
  session_id?: string | null;
  is_retry?: boolean;
  retry_of_attempt_id?: number | null;
}): Promise<DrillAttemptResp> {
  const resp = await api("/api/drill-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<DrillAttemptResp>(resp);
}

// ─── Phase 5D: concepts + progress ─────────────────────────
export interface UserConceptItem {
  concept_id: string;
  title: string;
  times_taught: number;
  last_taught_at: string | null;
  demonstrated: boolean;
}

export async function getUserConcepts(userId: string): Promise<UserConceptItem[]> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/concepts`);
  if (!resp.ok) return [];
  return asJson<UserConceptItem[]>(resp);
}

export interface ProgressPoint {
  week: string;
  value: number;
}

export interface UserProgressResponse {
  games_per_week: ProgressPoint[];
  drills_per_week: ProgressPoint[];
  top_weakness_severity_history: ProgressPoint[];
}

export async function getUserProgress(userId: string): Promise<UserProgressResponse> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/progress`);
  if (!resp.ok) {
    return { games_per_week: [], drills_per_week: [], top_weakness_severity_history: [] };
  }
  return asJson<UserProgressResponse>(resp);
}

export interface StreakResponse {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  last_7_days: string[];
  last_7_active: boolean[];
}

export async function getStreak(userId: string): Promise<StreakResponse> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/streak`);
  if (!resp.ok) {
    return { current_streak: 0, longest_streak: 0, last_active_date: null, last_7_days: [], last_7_active: [] };
  }
  return asJson<StreakResponse>(resp);
}

export interface DrillStatsResponse {
  total_attempts: number;
  accuracy: number | null;
}

export async function getDrillStats(userId: string): Promise<DrillStatsResponse> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/drill-stats`);
  if (!resp.ok) return { total_attempts: 0, accuracy: null };
  return asJson<DrillStatsResponse>(resp);
}

export interface ConceptListItem {
  id: string;
  title: string;
  tags: string[];
  summary?: string;
}

export async function listConcepts(tag?: string): Promise<ConceptListItem[]> {
  const qs = tag ? `?tag=${encodeURIComponent(tag)}` : "";
  const resp = await api(`/api/concepts${qs}`);
  if (!resp.ok) return [];
  return asJson<ConceptListItem[]>(resp);
}

export async function getConcept(id: string): Promise<ConceptT | null> {
  const resp = await api(`/api/concepts/${encodeURIComponent(id)}`);
  if (resp.status === 404) return null;
  return asJson<ConceptT>(resp);
}

export async function generateReview(
  gameId: string,
  forUserId: string,
  force = false,
): Promise<ReviewResponse> {
  const params = new URLSearchParams({ for_user_id: forUserId });
  if (force) params.set("force", "true");
  const resp = await api(`/api/games/${gameId}/review?${params}`, { method: "POST" });
  return asJson<ReviewResponse>(resp);
}

export async function getMoveOwnership(
  gameId: string,
  moveNumber: number,
): Promise<number[] | null> {
  const resp = await api(`/api/games/${gameId}/moves/${moveNumber}/ownership`);
  if (!resp.ok) return null;
  const data: { ownership: number[] } = await resp.json();
  return data.ownership ?? null;
}

export async function putPlayerNote(
  gameId: string,
  moveNumber: number,
  userId: string,
  body: string,
): Promise<void> {
  await api(`/api/games/${gameId}/moves/${moveNumber}/player-note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, body }),
  });
}

export async function getPlayerNotes(
  gameId: string,
  userId: string,
): Promise<Record<number, string>> {
  const resp = await api(
    `/api/games/${gameId}/player-notes?user_id=${encodeURIComponent(userId)}`,
  );
  if (!resp.ok) return {};
  const raw: Record<string, string> = await resp.json();
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [Number(k), v]));
}

// ─── Drill Sessions ──────────────────────────────────────────

export interface DrillSessionResp {
  id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  status: "active" | "finished" | "abandoned";
  problem_count: number;
  attempt_count: number;
  correct_count: number;
  target_problem_count: number;
}

export interface DrillAnalyticsResp {
  total_attempts: number;
  accuracy: number | null;
  sessions_count: number;
  accuracy_this_week: number | null;
  accuracy_last_week: number | null;
  theme_breakdown: Array<{ theme: string; attempts: number; correct: number }>;
}

export async function createDrillSession(userId: string, targetProblemCount = 5): Promise<DrillSessionResp> {
  const resp = await api("/api/drill-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, target_problem_count: targetProblemCount }),
  });
  return asJson<DrillSessionResp>(resp);
}

export async function finishDrillSession(sessionId: string): Promise<DrillSessionResp> {
  const resp = await api(`/api/drill-sessions/${encodeURIComponent(sessionId)}/finish`, {
    method: "POST",
  });
  return asJson<DrillSessionResp>(resp);
}

export async function deleteDrillSession(sessionId: string): Promise<{ deleted: boolean }> {
  const resp = await api(`/api/drill-sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  return asJson<{ deleted: boolean }>(resp);
}

export async function getDrillSession(sessionId: string): Promise<DrillSessionResp> {
  const resp = await api(`/api/drill-sessions/${encodeURIComponent(sessionId)}`);
  return asJson<DrillSessionResp>(resp);
}

export async function listDrillSessions(
  userId: string,
  limit = 20,
): Promise<DrillSessionResp[]> {
  const resp = await api(
    `/api/users/${encodeURIComponent(userId)}/drill-sessions?limit=${limit}`,
  );
  return asJson<DrillSessionResp[]>(resp);
}

export async function getDrillAnalytics(userId: string): Promise<DrillAnalyticsResp> {
  const resp = await api(`/api/users/${encodeURIComponent(userId)}/drill-analytics`);
  return asJson<DrillAnalyticsResp>(resp);
}
