import type { ColorCode, GameT, GameStateT, MoveKind, PointT } from "./types";
export type { ColorCode } from "./types";

async function asJson<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(detail || `${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

export interface UserT {
  id: string;
  handle: string;
}

export async function createUser(handle: string): Promise<UserT> {
  const resp = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  return asJson<UserT>(resp);
}

export interface CreateGameOpts {
  opponentType?: "human" | "ai";
  aiRank?: number;
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
  }
  const resp = await fetch("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return asJson<GameT>(resp);
}

export async function requestAiMove(id: string): Promise<GameStateT> {
  const resp = await fetch(`/api/games/${id}/ai-move`, { method: "POST" });
  return asJson<GameStateT>(resp);
}

export async function swapColors(id: string): Promise<GameT> {
  const resp = await fetch(`/api/games/${id}/swap_colors`, { method: "POST" });
  return asJson<GameT>(resp);
}

export async function fetchGame(id: string): Promise<GameT> {
  return asJson<GameT>(await fetch(`/api/games/${id}`));
}

export async function joinGame(id: string, userId: string): Promise<GameT> {
  const resp = await fetch(`/api/games/${id}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  return asJson<GameT>(resp);
}

export async function playMove(
  id: string,
  color: ColorCode,
  kind: MoveKind,
  point: PointT | null,
): Promise<GameStateT> {
  const resp = await fetch(`/api/games/${id}/moves`, {
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
}

export async function getMyGames(userId: string): Promise<UserGameListItem[]> {
  const resp = await fetch(`/api/users/${encodeURIComponent(userId)}/games`);
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
}

export interface AnalysisResponse {
  game_id: string;
  features: MoveFeature[];
}

export async function getGameAnalysis(id: string): Promise<AnalysisResponse | null> {
  const resp = await fetch(`/api/games/${id}/analysis`);
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
  return asJson<AnalyzeResponse>(await fetch(url, { method: "POST" }));
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
  const resp = await fetch(`/api/games/${gameId}/review?for_user_id=${encodeURIComponent(forUserId)}`);
  if (resp.status === 404) return null;
  return asJson<ReviewResponse>(resp);
}

// ─── Phase 4: weaknesses, agent loop, drills ───────────────
export interface WeaknessItem {
  theme: string;
  severity: number;
  evidence_count: number;
  last_seen_at: string | null;
}

export async function getWeaknesses(userId: string): Promise<WeaknessItem[]> {
  const resp = await fetch(`/api/users/${encodeURIComponent(userId)}/weaknesses`);
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

export async function getNextAction(userId: string): Promise<NextActionResponse> {
  const resp = await fetch(`/api/users/${encodeURIComponent(userId)}/next-action`, {
    method: "POST",
  });
  return asJson<NextActionResponse>(resp);
}

export async function getNextProblem(userId: string): Promise<ProblemT | null> {
  const resp = await fetch(`/api/users/${encodeURIComponent(userId)}/next-problem`);
  if (resp.status === 404) return null;
  return asJson<ProblemT>(resp);
}

export interface DrillAttemptResp {
  id: number;
  user_id: string;
  problem_id: string;
  attempted_at: string;
  success: boolean;
}

export async function postDrillAttempt(payload: {
  user_id: string;
  problem_id: string;
  success: boolean;
  moves_played: Array<Record<string, unknown>>;
  hint_used: boolean;
}): Promise<DrillAttemptResp> {
  const resp = await fetch("/api/drill-attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return asJson<DrillAttemptResp>(resp);
}

export async function generateReview(
  gameId: string,
  forUserId: string,
  force = false,
): Promise<ReviewResponse> {
  const params = new URLSearchParams({ for_user_id: forUserId });
  if (force) params.set("force", "true");
  const resp = await fetch(`/api/games/${gameId}/review?${params}`, { method: "POST" });
  return asJson<ReviewResponse>(resp);
}
