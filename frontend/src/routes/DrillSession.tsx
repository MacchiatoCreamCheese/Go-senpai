import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "../lib/auth";
import { useToast } from "../components/NotificationToast";
import {
  useDrillSession,
  useNextDrillProblem,
  useFinishDrillSession,
  useCreateDrillSession,
  useDrillAnalytics,
  DRILL_KEYS,
} from "../hooks/useDrillData";
import { useProfileWeaknesses } from "../hooks/useProfileData";
import { DrillProblemUI } from "./Drill";
import { buildSessionSummary } from "../services/drillService";
import type { SessionSummary } from "../types/drill";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

// ── Session summary modal ─────────────────────────────────────────────────────

interface SummaryModalProps {
  summary: SessionSummary;
  onDone: () => void;
  onNewSession: () => void;
  onTryAgain: () => void;
  isCreating: boolean;
  isPractice?: boolean;
}

function SessionSummaryModal({ summary, onDone, onNewSession, onTryAgain, isCreating, isPractice }: SummaryModalProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(26,23,20,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="gs-card"
        style={{
          padding: "36px 40px",
          background: isPractice ? "var(--pastel-yellow)" : "var(--pastel-green)",
          boxShadow: "var(--shadow-block)",
          maxWidth: 420, width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 52, lineHeight: 1, marginBottom: 12 }}>
          {isPractice ? "練" : "終"}
        </div>
        <div className="gs-tag" style={{ marginBottom: 14 }}>
          {isPractice ? "PRACTICE COMPLETE" : "SESSION COMPLETE"}
        </div>
        <h2 style={{ fontSize: 26, marginBottom: 6, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
          {isPractice ? "Practice done!" : "Session done!"}
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 24 }}>
          You finished {summary.totalAttempts} problem{summary.totalAttempts !== 1 ? "s" : ""}.
          {isPractice && " (Practice — stats not recorded.)"}
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
          <div className="gs-card" style={{ padding: "12px 20px", background: "var(--bg-2)", minWidth: 100 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28 }}>
              {pct(summary.accuracy)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>accuracy</div>
          </div>
          <div className="gs-card" style={{ padding: "12px 20px", background: "var(--bg-2)", minWidth: 100 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28 }}>
              {summary.correctCount}/{summary.totalAttempts}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>correct</div>
          </div>
          <div className="gs-card" style={{ padding: "12px 20px", background: "var(--bg-2)", minWidth: 100 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 28 }}>
              {formatDuration(summary.durationSeconds)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-mute)" }}>time</div>
          </div>
        </div>

        {summary.accuracy != null && summary.accuracy < 0.5 && (
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20, fontStyle: "italic" }}>
            Keep going — repetition is how patterns become instinct.
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {!isPractice && (
            <button
              type="button"
              className="gs-btn gs-btn--primary"
              onClick={onNewSession}
              disabled={isCreating}
            >
              {isCreating ? "Starting…" : "New Session"}
            </button>
          )}
          <button type="button" className="gs-btn gs-btn--yellow" onClick={onTryAgain}>
            Try Again
          </button>
          <button type="button" className="gs-btn" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

interface ProgressBarProps {
  current: number;
  correct: number;
  total: number;
  isPractice?: boolean;
}

function SessionProgressBar({ current, correct, total, isPractice }: ProgressBarProps) {
  const pctWidth = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div style={{
      padding: "10px 24px",
      borderBottom: "2px solid var(--border)",
      background: isPractice ? "var(--pastel-yellow)" : "var(--bg-2)",
      display: "flex",
      alignItems: "center",
      gap: 14,
    }}>
      {isPractice && (
        <span className="gs-pill gs-pill--yellow" style={{ fontSize: 11, padding: "1px 8px", flexShrink: 0 }}>
          practice
        </span>
      )}
      <span style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 13,
        color: "var(--ink-soft)",
        whiteSpace: "nowrap",
      }}>
        Problem {Math.min(current + 1, total)} of {total}
      </span>
      {current > 0 && (
        <span style={{
          fontSize: 12,
          color: "var(--ink-mute)",
          fontFamily: "var(--font-mono)",
          whiteSpace: "nowrap",
        }}>
          · {correct}/{current} correct
        </span>
      )}
      <div style={{
        flex: 1,
        height: 8,
        borderRadius: 999,
        background: "var(--border)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pctWidth}%`,
          background: isPractice ? "var(--tier-ok)" : "var(--ink)",
          borderRadius: 999,
          transition: "width 300ms ease",
        }} />
      </div>
      <Link
        to="/drill"
        style={{
          fontSize: 12,
          color: "var(--ink-mute)",
          textDecoration: "none",
          whiteSpace: "nowrap",
          fontFamily: "var(--font-mono)",
        }}
      >
        exit session
      </Link>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DrillSessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { userId } = useIdentity();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: session, isLoading: sessionLoading, error: sessionError } = useDrillSession(sessionId ?? null);

  const targetCount = session?.targetProblemCount ?? 5;
  const isSessionComplete = !!session && session.attemptCount >= targetCount;

  // Practice mode: replays problems without recording stats
  const returnTo = (location.state as Record<string, unknown> | null)?.from as string | undefined ?? "/drill";
  const [practiceMode, setPracticeMode] = useState<boolean>(() => !!(location.state as Record<string, unknown> | null)?.practiceMode);
  const [practiceAttempts, setPracticeAttempts] = useState(0);
  const [practiceCorrectCount, setPracticeCorrectCount] = useState(0);

  // In practice mode we always want to fetch the next problem
  const nextProblemEnabled = practiceMode ? true : !isSessionComplete;
  const nextProblemQ = useNextDrillProblem(userId, nextProblemEnabled);
  const finishSession = useFinishDrillSession();
  const createSession = useCreateDrillSession();
  const { data: userWeaknesses = [] } = useProfileWeaknesses(userId ?? null);
  const { data: analytics } = useDrillAnalytics(userId ?? null);

  const alreadyFinishingRef = useRef(false);
  const localAttemptCountRef = useRef<number | null>(null);
  const pendingCorrectRef = useRef<boolean | null>(null);  // wasCorrect of the last answered problem
  const prevProblemIdRef = useRef<string | null>(null);    // to detect problem-ID changes
  // Tracks which session the display counters were last seeded from (never re-seeds on refetch).
  const initializedForSessionRef = useRef<string | null>(null);

  // Display counters: ONLY updated when a new problem renders. Never touched by submit or refetch.
  const [localDisplayAttempts, setLocalDisplayAttempts] = useState(0);
  const [localDisplayCorrect, setLocalDisplayCorrect] = useState(0);

  // Seed counters once when a session first loads (handles joining a mid-session).
  // Keyed on session.id so a new session re-seeds; background refetches of the same session are ignored.
  useEffect(() => {
    if (!session || initializedForSessionRef.current === session.id) return;
    initializedForSessionRef.current = session.id;
    setLocalDisplayAttempts(session.attemptCount);
    setLocalDisplayCorrect(session.correctCount);
  }, [session?.id]); // intentionally excludes attemptCount/correctCount

  // Step the bar the moment a new problem ID becomes visible (= previous answer committed to screen).
  const currentProblemId = nextProblemQ.data?.id;
  useEffect(() => {
    if (!currentProblemId) return;
    if (prevProblemIdRef.current !== null && prevProblemIdRef.current !== currentProblemId) {
      setLocalDisplayAttempts(prev => prev + 1);
      if (pendingCorrectRef.current) setLocalDisplayCorrect(prev => prev + 1);
      pendingCorrectRef.current = null;
    }
    prevProblemIdRef.current = currentProblemId;
  }, [currentProblemId]);

  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  if (!userId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
        <div className="gs-card" style={{ padding: "32px 36px", background: "var(--pastel-yellow)", boxShadow: "var(--shadow-block)", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 60, marginBottom: 12 }}>練</div>
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>Sign in required</h1>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 20 }}>Set a name in the Lobby first to use sessions.</p>
          <Link to="/lobby" className="gs-btn gs-btn--primary" style={{ textDecoration: "none" }}>Go to Lobby →</Link>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return <div style={{ padding: 40, textAlign: "center" }}>Invalid session.</div>;
  }

  if (sessionLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
        <div className="prf-skeleton-wrap" style={{ width: 300 }}>
          {[80, 60, 90].map((w, i) => <div key={i} className="prf-skeleton-line" style={{ width: `${w}%` }} />)}
        </div>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
        <div className="prf-error">
          <div className="prf-error-glyph">⚠</div>
          <div className="prf-error-msg">Could not load session.</div>
          <p className="prf-error-hint">Try refreshing the page.</p>
        </div>
      </div>
    );
  }

  const problemLoading = nextProblemQ.isLoading;
  const problem = nextProblemQ.data ?? null;

  async function handleNext(wasCorrect?: boolean) {
    if (!session || !userId) return;

    if (practiceMode) {
      const nextCorrect = practiceCorrectCount + (wasCorrect ? 1 : 0);
      const nextAttempts = practiceAttempts + 1;
      setPracticeCorrectCount(nextCorrect);
      setPracticeAttempts(nextAttempts);
      if (nextAttempts >= targetCount) {
        setSummary({
          sessionId: session.id,
          totalAttempts: nextAttempts,
          correctCount: nextCorrect,
          accuracy: nextAttempts > 0 ? nextCorrect / nextAttempts : null,
          durationSeconds: null,
        });
        setShowSummary(true);
      } else {
        qc.invalidateQueries({ queryKey: DRILL_KEYS.nextProblem(userId) });
      }
      return;
    }

    if (finishSession.isPending || alreadyFinishingRef.current) return;

    localAttemptCountRef.current = Math.max(
      (localAttemptCountRef.current ?? 0) + 1,
      session.attemptCount,
    );
    pendingCorrectRef.current = wasCorrect ?? false;
    const shouldFinish = localAttemptCountRef.current >= targetCount;

    if (shouldFinish) {
      alreadyFinishingRef.current = true;
      try {
        const finished = await finishSession.mutateAsync({ sessionId: session.id, userId });
        setSummary(buildSessionSummary(finished));
        setShowSummary(true);
      } catch (err) {
        alreadyFinishingRef.current = false;
        toast.push({ kind: "error", title: "Could not finish session", body: String(err) });
      }
    } else {
      qc.invalidateQueries({ queryKey: DRILL_KEYS.nextProblem(userId) });
    }
  }

  async function handleNewSession() {
    if (!userId) return;
    const newSession = await createSession.mutateAsync({ userId, targetProblemCount: targetCount });
    alreadyFinishingRef.current = false;
    localAttemptCountRef.current = null;
    setLocalDisplayAttempts(0);
    setLocalDisplayCorrect(0);
    setShowSummary(false);
    setSummary(null);
    setPracticeMode(false);
    setPracticeAttempts(0);
    setPracticeCorrectCount(0);
    navigate(`/drill/session/${newSession.id}`, { replace: true });
  }

  function handleTryAgain() {
    void handleNewSession();
  }

  const displayCurrent = practiceMode ? practiceAttempts : localDisplayAttempts;
  const displayCorrect = practiceMode ? practiceCorrectCount : localDisplayCorrect;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <SessionProgressBar
        current={displayCurrent}
        correct={displayCorrect}
        total={targetCount}
        isPractice={practiceMode}
      />

      {problemLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
          <div className="prf-skeleton-wrap" style={{ width: 300 }}>
            {[80, 60, 90, 70].map((w, i) => <div key={i} className="prf-skeleton-line" style={{ width: `${w}%` }} />)}
          </div>
        </div>
      ) : !problem ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
          <div className="prf-empty">
            <div className="prf-empty-glyph">練</div>
            <div className="prf-empty-title">No problems available</div>
            <p className="prf-empty-sub">The drill picker returned nothing for your current profile.</p>
            <Link to="/drill" className="gs-btn gs-btn--primary" style={{ textDecoration: "none", marginTop: 16 }}>Back to Drill Hub →</Link>
          </div>
        </div>
      ) : (
        <DrillProblemUI
          problem={problem}
          userId={userId}
          sessionId={practiceMode ? null : sessionId}
          onNext={handleNext}
          isPractice={practiceMode}
          userWeaknesses={userWeaknesses}
          themeAccuracy={analytics?.themeBreakdown ?? []}
        />
      )}

      {showSummary && summary && (
        <SessionSummaryModal
          summary={summary}
          onDone={() => navigate(returnTo)}
          onNewSession={handleNewSession}
          onTryAgain={handleTryAgain}
          isCreating={createSession.isPending}
          isPractice={practiceMode}
        />
      )}
    </div>
  );
}
