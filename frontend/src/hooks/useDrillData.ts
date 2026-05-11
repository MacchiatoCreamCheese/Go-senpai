import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { drillRepository } from "../repositories/DrillRepository";
import { enrichSession, buildDrillAnalytics, buildSessionSummary } from "../services/drillService";
import type { DrillSession, DrillAnalytics, SessionSummary } from "../types/drill";

const STALE_MS = 2 * 60_000;

export const DRILL_KEYS = {
  nextProblem: (userId: string) => ["drill", "nextProblem", userId] as const,
  problem:     (id: string)     => ["drill", "problem", id] as const,
  sessions:    (userId: string) => ["drill", "sessions", userId] as const,
  session:     (id: string)     => ["drill", "session", id] as const,
  analytics:   (userId: string) => ["drill", "analytics", userId] as const,
  stats:       (userId: string) => ["drill", "stats", userId] as const,
} as const;

export function useNextDrillProblem(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: DRILL_KEYS.nextProblem(userId ?? ""),
    queryFn: () => drillRepository.getNextProblem(userId!),
    enabled: !!userId && enabled,
    staleTime: STALE_MS,
  });
}

export function useDrillProblem(problemId: string | null) {
  return useQuery({
    queryKey: DRILL_KEYS.problem(problemId ?? ""),
    queryFn: () => drillRepository.getProblem(problemId!),
    enabled: !!problemId,
    staleTime: STALE_MS,
  });
}

export function useDrillSessions(userId: string | null, limit = 20): {
  data: DrillSession[] | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: DRILL_KEYS.sessions(userId ?? ""),
    queryFn: () => drillRepository.listDrillSessions(userId!, limit),
    select: (rows) => rows.map(enrichSession),
    enabled: !!userId,
    staleTime: STALE_MS,
  });
  return { data: q.data, isLoading: q.isLoading, error: (q.error as Error | null) ?? null };
}

export function useDrillSession(sessionId: string | null): {
  data: DrillSession | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: DRILL_KEYS.session(sessionId ?? ""),
    queryFn: () => drillRepository.getDrillSession(sessionId!),
    select: enrichSession,
    enabled: !!sessionId,
    staleTime: STALE_MS,
  });
  return { data: q.data, isLoading: q.isLoading, error: (q.error as Error | null) ?? null };
}

export function useDrillAnalytics(userId: string | null): {
  data: DrillAnalytics | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: DRILL_KEYS.analytics(userId ?? ""),
    queryFn: () => drillRepository.getDrillAnalytics(userId!),
    select: buildDrillAnalytics,
    enabled: !!userId,
    staleTime: STALE_MS,
  });
  return { data: q.data, isLoading: q.isLoading, error: (q.error as Error | null) ?? null };
}

export function useDrillStats(userId: string | null) {
  return useQuery({
    queryKey: DRILL_KEYS.stats(userId ?? ""),
    queryFn: () => drillRepository.getDrillStats(userId!),
    enabled: !!userId,
    staleTime: STALE_MS,
  });
}

export function useCreateDrillSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, targetProblemCount }: { userId: string; targetProblemCount: number }) =>
      drillRepository.createDrillSession(userId, targetProblemCount),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: DRILL_KEYS.sessions(userId) });
    },
  });
}

export function useDeleteDrillSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId }: { sessionId: string; userId: string }) =>
      drillRepository.deleteDrillSession(sessionId),
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: DRILL_KEYS.sessions(userId) });
      qc.invalidateQueries({ queryKey: DRILL_KEYS.analytics(userId) });
      qc.invalidateQueries({ queryKey: DRILL_KEYS.stats(userId) });
    },
  });
}

export function useFinishDrillSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId }: { sessionId: string; userId: string }) =>
      drillRepository.finishDrillSession(sessionId),
    onSuccess: (_data, { sessionId, userId }) => {
      qc.invalidateQueries({ queryKey: DRILL_KEYS.session(sessionId) });
      qc.invalidateQueries({ queryKey: DRILL_KEYS.sessions(userId) });
      qc.invalidateQueries({ queryKey: DRILL_KEYS.analytics(userId) });
      qc.invalidateQueries({ queryKey: DRILL_KEYS.stats(userId) });
    },
  });
}

export function useSubmitDrillAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      user_id: string; problem_id: string; success: boolean;
      moves_played: Array<Record<string, unknown>>; hint_used: boolean;
      session_id?: string | null;
      is_retry?: boolean;
      retry_of_attempt_id?: number | null;
    }) => drillRepository.postDrillAttempt(payload),
    onSuccess: (_data, payload) => {
      // nextProblem invalidation intentionally removed — DrillSession.handleNext controls this
      qc.invalidateQueries({ queryKey: DRILL_KEYS.sessions(payload.user_id) });
      qc.invalidateQueries({ queryKey: DRILL_KEYS.analytics(payload.user_id) });
      qc.invalidateQueries({ queryKey: DRILL_KEYS.stats(payload.user_id) });
      if (payload.session_id) {
        qc.invalidateQueries({ queryKey: DRILL_KEYS.session(payload.session_id) });
      }
    },
  });
}

export function useSessionSummary(sessionId: string | null): SessionSummary | null {
  const { data } = useDrillSession(sessionId);
  if (!data) return null;
  return buildSessionSummary({
    id: data.id,
    user_id: data.userId,
    started_at: data.startedAt,
    finished_at: data.finishedAt,
    status: data.status,
    problem_count: data.problemCount,
    attempt_count: data.attemptCount,
    correct_count: data.correctCount,
    target_problem_count: data.targetProblemCount,
  });
}
