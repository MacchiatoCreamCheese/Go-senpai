import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import type { ProblemT, WeaknessItem } from "../api";
import { GoBoard } from "../GoBoard";
import { useToast } from "../components/NotificationToast";
import { boardAtMove, formatCoord, parseCoord, type Cell } from "../lib/replay";
import { parseProblemSgf, setupToBoard } from "../lib/sgf";
import { useIdentity } from "../lib/auth";
import type { MoveT } from "../types";
import type { ThemeBreakdown } from "../types/drill";
import {
  useNextDrillProblem,
  useDrillProblem,
  useSubmitDrillAttempt,
  DRILL_KEYS,
} from "../hooks/useDrillData";
import {
  generateWhyExplanation,
  generateGoalText,
  generateFailureHint,
  difficultyLabel,
} from "../services/drillService";

interface SolutionStep {
  color: "B" | "W";
  coord: string;
}

function StubCard({ mark, title, body, cta }: { mark: string; title: string; body: string; cta: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
      <div className="gs-card" style={{ padding: "32px 36px", background: "var(--pastel-yellow)", boxShadow: "var(--shadow-block)", textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 60, marginBottom: 12 }}>{mark}</div>
        <h1 style={{ fontSize: 24, marginBottom: 10 }}>{title}</h1>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 20 }}>{body}</p>
        {cta}
      </div>
    </div>
  );
}

export default function Drill() {
  const { problemId } = useParams<{ problemId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as Record<string, unknown> | null)?.from as string | undefined ?? "/drill";
  const { userId } = useIdentity();
  const queryClient = useQueryClient();

  const nextQ = useNextDrillProblem(problemId ? null : userId);
  const directQ = useDrillProblem(problemId ?? null);

  const isLoading = problemId ? directQ.isLoading : nextQ.isLoading;
  const problem: ProblemT | null = (problemId ? directQ.data : nextQ.data) ?? null;

  if (!userId) {
    return (
      <StubCard
        mark="練"
        title="Drill"
        body="Set a name in the Lobby first — drills are personalised to you."
        cta={<Link to="/lobby" className="gs-btn gs-btn--primary" style={{ textDecoration: "none" }}>Go to Lobby →</Link>}
      />
    );
  }

  if (isLoading) {
    return (
      <StubCard
        mark="練"
        title="Loading…"
        body="Picking your next problem…"
        cta={null}
      />
    );
  }

  if (problemId && !problem) {
    return (
      <StubCard
        mark="練"
        title="Problem not found"
        body="No problem with that ID exists in the database."
        cta={<Link to="/drill" className="gs-btn gs-btn--primary" style={{ textDecoration: "none" }}>Get next problem →</Link>}
      />
    );
  }

  if (!problem) {
    return (
      <StubCard
        mark="練"
        title="No problems available"
        body="The drill picker returned nothing for you yet."
        cta={<Link to="/" className="gs-btn gs-btn--primary" style={{ textDecoration: "none" }}>Back to Home →</Link>}
      />
    );
  }

  return (
    <DrillProblemUI
      problem={problem}
      userId={userId}
      onNext={() => {
        queryClient.invalidateQueries({ queryKey: DRILL_KEYS.nextProblem(userId) });
        navigate(returnTo, { replace: true });
      }}
    />
  );
}

export interface DrillProblemUIProps {
  problem: ProblemT;
  userId: string;
  onNext: (wasCorrect?: boolean) => void;
  sessionId?: string | null;
  isPractice?: boolean;
  userWeaknesses?: WeaknessItem[];
  themeAccuracy?: ThemeBreakdown[];
}

export function DrillProblemUI({ problem, userId, onNext, sessionId, isPractice, userWeaknesses = [], themeAccuracy = [] }: DrillProblemUIProps) {
  const toast = useToast();

  const setup = useMemo(() => parseProblemSgf(problem.sgf), [problem.sgf]);
  const initialBoard: Cell[][] = useMemo(() => setupToBoard(setup), [setup]);
  const solution = useMemo<SolutionStep[]>(
    () => (problem.solution as unknown as SolutionStep[]) ?? [],
    [problem.solution],
  );

  const [movesPlayed, setMovesPlayed] = useState<MoveT[]>([]);
  const [resolved, setResolved] = useState<"pending" | "solved" | "failed" | "revealed">("pending");
  const [hintUsed, setHintUsed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [lastAttemptId, setLastAttemptId] = useState<number | null>(null);
  const [hasAttemptedOnce, setHasAttemptedOnce] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMovesPlayed([]);
    setResolved("pending");
    setHintUsed(false);
    setModalOpen(false);
    setLastAttemptId(null);
    setHasAttemptedOnce(false);
    setCopied(false);
  }, [problem.id]);

  const currentBoard = useMemo(() => {
    const r = boardAtMove(setup.size, movesPlayed, movesPlayed.length);
    const cells = initialBoard.map((row) => row.slice() as Cell[]);
    let working = cells;
    if (movesPlayed.length > 0) {
      for (const m of movesPlayed) {
        if (m.kind !== "play" || !m.point) continue;
        working[m.point.row][m.point.col] = m.color === "B" ? 1 : 2;
      }
    }
    return { cells: working, last: r.last };
  }, [initialBoard, setup.size, movesPlayed]);

  const submitAttempt = useSubmitDrillAttempt();

  async function doSubmit(success: boolean) {
    if (isPractice) return;
    try {
      const row = await submitAttempt.mutateAsync({
        user_id: userId,
        problem_id: problem.id,
        success,
        moves_played: movesPlayed.map((m) => ({
          color: m.color,
          coord: m.point ? formatCoord(m.point.row, m.point.col, setup.size) : m.kind,
        })),
        hint_used: hintUsed,
        session_id: sessionId ?? null,
        is_retry: hasAttemptedOnce,
        retry_of_attempt_id: hasAttemptedOnce ? lastAttemptId : null,
      });
      setLastAttemptId(row.id);
      setHasAttemptedOnce(true);
    } catch (err) {
      toast.push({ kind: "error", title: "Couldn't log attempt", body: String(err) });
    }
  }

  function retryProblem() {
    setMovesPlayed([]);
    setResolved("pending");
    setHintUsed(false);
    setModalOpen(false);
  }

  function handlePlay(point: { row: number; col: number }) {
    if (resolved !== "pending") return;
    const stepIndex = movesPlayed.length;
    const expected = solution[stepIndex];
    if (!expected) return;

    const expectedPoint = parseCoord(expected.coord, setup.size);
    if (!expectedPoint) {
      const m: MoveT = { color: expected.color, kind: "play", point };
      setMovesPlayed((prev) => [...prev, m]);
      return;
    }

    if (point.row === expectedPoint.row && point.col === expectedPoint.col) {
      const m: MoveT = { color: expected.color, kind: "play", point };
      const nextMoves = [...movesPlayed, m];
      setMovesPlayed(nextMoves);
      if (nextMoves.length === solution.length) {
        setResolved("solved");
        setModalOpen(true);
        void doSubmit(true);
      }
    } else {
      const m: MoveT = { color: expected.color, kind: "play", point };
      setMovesPlayed((prev) => [...prev, m]);
      setResolved("failed");
      setModalOpen(true);
      void doSubmit(false);
    }
  }

  function showHint() {
    setHintUsed(true);
    const expected = solution[movesPlayed.length];
    if (!expected) return;
    toast.push({
      kind: "info",
      title: "Hint",
      body: `Try ${expected.color === "B" ? "Black" : "White"} at ${expected.coord}.`,
    });
  }

  function showSolution() {
    if (resolved === "pending") void doSubmit(false);
    setResolved("revealed");
    setModalOpen(false);
    const filled: MoveT[] = solution.map((s) => {
      const p = parseCoord(s.coord, setup.size);
      return { color: s.color, kind: "play", point: p ?? { row: 0, col: 0 } };
    });
    setMovesPlayed(filled);
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/drill/${problem.id}`).catch(() => {});
    toast.push({ kind: "info", title: "Copied", body: "Puzzle link copied to clipboard." });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const themeLabel = problem.themes.slice(0, 2).map((t) => t.replace(/_/g, " ")).join(" · ") || "tsumego";
  const toPlayLabel = setup.toPlay === "B" ? "BLACK" : "WHITE";

  return (
    <div className="drill-page">
      <div className="drill-shell">
        <aside className="drill-column drill-column--left">
          <section className="gs-card drill-panel drill-panel--accent">
            <div className="drill-panel-head">
              <span className="gs-section-h">WHY THIS PROBLEM</span>
              <span className="drill-why-icon" aria-hidden="true">⟳</span>
            </div>
            <p className="drill-why-body">
              {generateWhyExplanation(problem, userWeaknesses, themeAccuracy)}
            </p>
          </section>

          <section className="gs-card drill-panel">
            <div className="gs-section-h" style={{ marginBottom: 12 }}>PROBLEM INFO</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <InfoRow label="Theme" value={themeLabel} />
              <InfoRow label="Difficulty" value={`${problem.difficulty} / 10`} />
              <InfoRow label="Board size" value={`${setup.size}×${setup.size}`} />
              <InfoRow label="Steps" value={`${Math.min(movesPlayed.length + 1, solution.length)} / ${solution.length}`} />
              <InfoRow label="Hint" value={hintUsed ? "used" : "available"} />
            </div>
          </section>

          <section className="gs-card drill-panel drill-panel--soft">
            <div className="gs-section-h" style={{ marginBottom: 10 }}>SHARE</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code className="drill-share-url">/drill/{problem.id.slice(0, 12)}</code>
              <button
                type="button"
                className={`gs-btn drill-copy-btn${copied ? " drill-copy-btn--copied" : ""}`}
                style={{ padding: "4px 12px", fontSize: 11 }}
                onClick={copyLink}
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </section>
        </aside>

        <main className="drill-column drill-column--center">
          <section className="gs-card drill-board-card">
            <div className="drill-board-head">
              <div>
                <div className="gs-section-h">BOARD</div>
                <p className="drill-board-subtitle">{toPlayLabel} to play · {themeLabel.toUpperCase()}</p>
              </div>
              <span className={`gs-pill ${
                resolved === "solved" ? "gs-pill--mint" :
                resolved === "failed" ? "gs-pill--red" :
                resolved === "revealed" ? "gs-pill--lav" : "gs-pill--yellow"
              }`}>
                {resolved === "pending" ? "in progress" :
                 resolved === "solved" ? "✓ solved" :
                 resolved === "failed" ? "✗ wrong" : "revealed"}
              </span>
            </div>

            <div className="drill-sticker-wrap">
              <div className="drill-sticker-overlay">
                <span className="gs-sticker" style={{ fontSize: 11 }}>
                  {toPlayLabel} TO PLAY · {themeLabel.toUpperCase()}
                </span>
              </div>
              <div style={{ marginTop: 20 }}>
                <GoBoard
                  board={currentBoard.cells}
                  lastMove={currentBoard.last}
                  onPlay={handlePlay}
                  disabled={resolved !== "pending"}
                  width={460}
                />
              </div>
            </div>

            <div className="drill-attempt-bar">
              <span>{`step ${Math.min(movesPlayed.length + 1, solution.length)} of ${solution.length}`}</span>
            </div>
          </section>
        </main>

        <aside className="drill-column drill-column--right">
          <section className="gs-card drill-panel">
            <div className="drill-panel-head">
              <span className="gs-section-h">GOAL</span>
              {(() => { const d = difficultyLabel(problem.difficulty); return (
                <span className={`drill-diff-badge drill-diff-badge--${d.tier}`}>{d.label}</span>
              ); })()}
            </div>
            <p className="drill-goal-body">{generateGoalText(problem.themes, setup.toPlay)}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {problem.themes.map((t) => (
                <span key={t} className="gs-tag drill-theme-tag">{t.replace(/_/g, " ")}</span>
              ))}
            </div>
          </section>

          {movesPlayed.length > 0 && (
            <section className="gs-card drill-panel">
              <div className="gs-section-h" style={{ marginBottom: 10 }}>YOUR MOVES</div>
              <div className="drill-move-list">
                {movesPlayed.map((m, i) => {
                  const isCorrect = i < solution.length && m.kind === "play" && m.point &&
                    (() => {
                      const ep = parseCoord(solution[i].coord, setup.size);
                      return ep && m.point.row === ep.row && m.point.col === ep.col;
                    })();
                  return (
                    <div key={i} className="drill-move-row">
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: m.color === "B" ? "var(--ink)" : "var(--bg-2)",
                        border: "2px solid var(--ink)",
                        flexShrink: 0,
                      }} />
                      <span className="drill-move-coord">
                        {m.point ? formatCoord(m.point.row, m.point.col, setup.size) : m.kind}
                      </span>
                      <span className={`drill-move-result ${isCorrect ? "good" : "bad"}`}>
                        {isCorrect ? "✓" : "✗"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="gs-card drill-panel drill-actions-panel">
            <div className="drill-action-stack">
              <button
                type="button"
                className="gs-btn gs-btn--yellow"
                onClick={showHint}
                disabled={resolved === "solved" || resolved === "revealed"}
                style={{ width: "100%" }}
              >
                Hint (−1 stamp)
              </button>
              <button
                type="button"
                className="gs-btn"
                onClick={showSolution}
                disabled={resolved === "solved" || resolved === "revealed"}
                style={{ width: "100%" }}
              >
                Show solution
              </button>
              {(resolved !== "pending") && (
                <button
                  type="button"
                  className="gs-btn gs-btn--primary"
                  onClick={() => onNext(resolved === "solved")}
                  style={{ width: "100%" }}
                >
                  Next problem →
                </button>
              )}
            </div>
            {resolved === "revealed" && (
              <p className="drill-action-note">
                Full solution on the board — study it, then move on.
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* ── Result modal ─────────────────────────────── */}
      {modalOpen && (resolved === "solved" || resolved === "failed") && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(26,23,20,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="gs-card"
            style={{
              padding: "32px 36px",
              background: resolved === "solved" ? "var(--pastel-green)" : "var(--pastel-pink)",
              boxShadow: "var(--shadow-block)",
              maxWidth: 400, width: "100%",
              textAlign: "center",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Dismiss"
              style={{
                position: "absolute", top: 12, right: 12,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 20, color: "var(--ink-mute)",
              }}
            >×</button>

            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 48, lineHeight: 1, marginBottom: 10 }}>
              {resolved === "solved" ? "✓" : "✗"}
            </div>
            <div className="gs-tag" style={{ marginBottom: 12 }}>
              {resolved === "solved" ? "CORRECT" : "TRY AGAIN"}
            </div>
            <h2 style={{ fontSize: 24, marginBottom: 10 }}>
              {resolved === "solved" ? "Well done!" : "Not quite."}
            </h2>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: resolved === "failed" ? 8 : 20 }}>
              {resolved === "solved"
                ? hintUsed
                  ? "Solved with a hint — count this as half-credit."
                  : "Solved cleanly. Sensei will adjust your weakness model."
                : "Dismiss to study the position, then reveal the solution or move on."}
            </p>
            {resolved === "failed" && (() => {
              const hint = generateFailureHint(problem.themes);
              return hint ? (
                <p style={{ fontSize: 12, color: "var(--ink-soft)", fontStyle: "italic", marginBottom: 20 }}>
                  {hint}
                </p>
              ) : <div style={{ marginBottom: 20 }} />;
            })()}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {resolved === "failed" && (
                <button type="button" className="gs-btn gs-btn--primary" onClick={retryProblem} disabled={submitAttempt.isPending}>
                  {submitAttempt.isPending ? "Saving…" : "Try Again"}
                </button>
              )}
              {resolved === "failed" && (
                <button type="button" className="gs-btn" onClick={() => { setModalOpen(false); showSolution(); }}>
                  Reveal solution
                </button>
              )}
              <button type="button" className="gs-btn" onClick={() => onNext(resolved === "solved")}>
                Next problem →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{value}</span>
    </div>
  );
}
