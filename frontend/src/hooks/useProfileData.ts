import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { profileRepository } from "../repositories/ProfileRepository";
import {
  enrichMatches,
  toConceptProgress,
  buildAnalytics,
} from "../services/profileService";
import type {
  EnrichedMatch,
  ConceptProgressItem,
  ProfileAnalyticsData,
  ProfileStats,
  DrillStats,
} from "../types/profile";

const STALE_MS = 2 * 60 * 1000;

interface QueryOpts {
  enabled?: boolean;
}

// ── Primitive slices ──────────────────────────────────────────────────────────

export function useProfileGames(userId: string | null) {
  return useQuery({
    queryKey: ["profile", "games", userId],
    queryFn: () => profileRepository.getGames(userId!),
    select: enrichMatches,
    enabled: !!userId,
    staleTime: STALE_MS,
  });
}

export function useProfileWeaknesses(userId: string | null) {
  return useQuery({
    queryKey: ["profile", "weaknesses", userId],
    queryFn: () => profileRepository.getWeaknesses(userId!),
    enabled: !!userId,
    staleTime: STALE_MS,
  });
}

export function useProfileConcepts(userId: string | null, opts?: QueryOpts) {
  const enabled = !!userId && (opts?.enabled ?? true);
  return useQuery({
    queryKey: ["profile", "concepts", userId],
    queryFn: () => profileRepository.getConcepts(userId!),
    select: toConceptProgress,
    enabled,
    staleTime: STALE_MS,
  });
}

export function useProfileDrillStats(userId: string | null): {
  data: DrillStats | null;
  isLoading: boolean;
  error: Error | null;
} {
  const q = useQuery({
    queryKey: ["profile", "drillStats", userId],
    queryFn: () => profileRepository.getDrillStats(userId!),
    enabled: !!userId,
    staleTime: STALE_MS,
  });
  const data = useMemo<DrillStats | null>(() => {
    if (!q.data) return null;
    return { totalAttempts: q.data.total_attempts, accuracy: q.data.accuracy };
  }, [q.data]);
  return { data, isLoading: q.isLoading, error: (q.error as Error | null) ?? null };
}

// ── Analytics (composes concepts + progress) ──────────────────────────────────

export function useProfileAnalytics(userId: string | null, opts?: QueryOpts): {
  data: ProfileAnalyticsData | null;
  isLoading: boolean;
  error: Error | null;
} {
  const enabled = !!userId && (opts?.enabled ?? true);

  // Each query shares its cache key with the corresponding primitive hook.
  // React Query deduplicates in-flight requests — no double-fetching.
  const conceptsQ = useQuery({
    queryKey: ["profile", "concepts", userId],
    queryFn: () => profileRepository.getConcepts(userId!),
    enabled,
    staleTime: STALE_MS,
  });
  const progressQ = useQuery({
    queryKey: ["profile", "progress", userId],
    queryFn: () => profileRepository.getProgress(userId!),
    enabled,
    staleTime: STALE_MS,
  });

  const data = useMemo<ProfileAnalyticsData | null>(() => {
    if (!conceptsQ.data || !progressQ.data) return null;
    return buildAnalytics(progressQ.data, conceptsQ.data);
  }, [conceptsQ.data, progressQ.data]);

  return {
    data,
    isLoading: conceptsQ.isLoading || progressQ.isLoading,
    error: (conceptsQ.error ?? progressQ.error) as Error | null,
  };
}

// ── Derived stats (pure memo, no fetch) ───────────────────────────────────────

export function useProfileStats(
  games: EnrichedMatch[],
  concepts: ConceptProgressItem[],
): ProfileStats {
  return useMemo(() => {
    const finished = games.filter(g => g.isFinished);
    const wins = finished.filter(g => g.isWin === true).length;
    return {
      totalGames: games.length,
      finishedGames: finished.length,
      totalConcepts: concepts.length,
      winRate: finished.length > 0 ? wins / finished.length : null,
      totalDrills: 0,
    };
  }, [games, concepts]);
}
