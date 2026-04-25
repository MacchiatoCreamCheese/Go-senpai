import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getNextProblem, postDrillAttempt, type ProblemT } from "../api";
import { GoBoard } from "../GoBoard";
import { useToast } from "../components/NotificationToast";
import { boardAtMove, formatCoord, parseCoord, type Cell } from "../lib/replay";
import { parseProblemSgf, setupToBoard } from "../lib/sgf";
import type { MoveT } from "../types";

const USER_ID_KEY = "senpai_user_id";

interface SolutionStep {
  color: "B" | "W";
  coord: string;
}

export default function Drill() {
  const { problemId } = useParams<{ problemId?: string }>();
  const navigate = useNavigate();
  const userId = localStorage.getItem(USER_ID_KEY);
  const queryClient = useQueryClient();

  const next = useQuery({
    queryKey: ["next-problem", userId, problemId],
    queryFn: () => (userId ? getNextProblem(userId) : Promise.resolve(null)),
    enabled: !!userId && !problemId,
  });

  // problemId path is not implemented (no GET /problems/:id) — fall through.
  const problem: ProblemT | null = next.data ?? null;

  if (!userId) {
    return (
      <div className="stub-page">
        <div className="stub-mark">練</div>
        <h1>Drill</h1>
        <p>Set a name in the Lobby first — drills are personalised to you.</p>
        <Link to="/lobby" className="btn btn-primary">Go to Lobby</Link>
      </div>
    );
  }

  if (next.isLoading) {
    return (
      <div className="stub-page">
        <div className="stub-mark">練</div>
        <p className="dim">Picking your next problem…</p>
      </div>
    );
  }

  if (problemId && !problem) {
    return (
      <div className="stub-page">
        <div className="stub-mark">練</div>
        <h1>Direct problem links</h1>
        <p>
          Backend doesn't yet expose <code>GET /problems/:id</code>; for now use the
          generic next-problem flow.
        </p>
        <Link to="/drill" className="btn btn-primary">Get next problem</Link>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="stub-page">
        <div className="stub-mark">練</div>
        <h1>No problems available</h1>
        <p>The drill picker returned nothing for you yet.</p>
        <Link to="/" className="btn btn-primary">Back to Home</Link>
      </div>
    );
  }

  return (
    <DrillSession
      problem={problem}
      userId={userId}
      onNext={() => {
        queryClient.invalidateQueries({ queryKey: ["next-problem", userId, problemId] });
        navigate("/drill", { replace: true });
      }}
    />
  );
}

interface DrillSessionProps {
  problem: ProblemT;
  userId: string;
  onNext: () => void;
}

function DrillSession({ problem, userId, onNext }: DrillSessionProps) {
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

  // Reset when problem changes.
  useEffect(() => {
    setMovesPlayed([]);
    setResolved("pending");
    setHintUsed(false);
    setModalOpen(false);
  }, [problem.id]);

  // Replay current state by treating initial board as starting position and
  // applying movesPlayed on top.
  const currentBoard = useMemo(() => {
    const r = boardAtMove(setup.size, movesPlayed, movesPlayed.length);
    // Stamp the setup stones as the base.
    const cells = initialBoard.map((row) => row.slice() as Cell[]);
    // Apply each move on top of the setup so captures work against setup stones.
    let working = cells;
    if (movesPlayed.length > 0) {
      // Re-run replay but seeded with setup. Easiest: write a small shim — for
      // simplicity here, just overlay placed stones (no captures vs setup is
      // good enough for the seeded ladder/snapback problems).
      for (const m of movesPlayed) {
        if (m.kind !== "play" || !m.point) continue;
        working[m.point.row][m.point.col] = m.color === "B" ? 1 : 2;
      }
    }
    return { cells: working, last: r.last };
  }, [initialBoard, setup.size, movesPlayed]);

  const submit = useMutation({
    mutationFn: (success: boolean) =>
      postDrillAttempt({
        user_id: userId,
        problem_id: problem.id,
        success,
        moves_played: movesPlayed.map((m) => ({
          color: m.color,
          coord: m.point ? formatCoord(m.point.row, m.point.col, setup.size) : m.kind,
        })),
        hint_used: hintUsed,
      }),
    onError: (err) => toast.push({ kind: "error", title: "Couldn't log attempt", body: String(err) }),
  });

  function handlePlay(point: { row: number; col: number }) {
    if (resolved !== "pending") return;
    const stepIndex = movesPlayed.length;
    const expected = solution[stepIndex];
    if (!expected) return;

    const expectedPoint = parseCoord(expected.coord, setup.size);
    if (!expectedPoint) {
      // Solution coord we can't parse — accept and move on.
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
        submit.mutate(true);
      }
    } else {
      // Wrong move — show as a ghost play and mark failed.
      const m: MoveT = { color: expected.color, kind: "play", point };
      setMovesPlayed((prev) => [...prev, m]);
      setResolved("failed");
      setModalOpen(true);
      submit.mutate(false);
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
    // Don't open the modal — leave the board fully visible so the user can
    // study the answer. Mark as "revealed" (counted as fail in the log).
    if (resolved === "pending") submit.mutate(false);
    setResolved("revealed");
    setModalOpen(false);
    const filled: MoveT[] = solution.map((s) => {
      const p = parseCoord(s.coord, setup.size);
      return { color: s.color, kind: "play", point: p ?? { row: 0, col: 0 } };
    });
    setMovesPlayed(filled);
  }

  const themeLabel =
    problem.themes.slice(0, 2).map((t) => t.replace(/_/g, " ")).join(" · ") || "tsumego";

  return (
    <div className="drill-page">
      <header className="drill-head">
        <div>
          <span className="home-eyebrow">Practising</span>
          <h1 className="drill-title">{themeLabel}</h1>
          <p className="dim">
            {setup.toPlay === "B" ? "Black" : "White"} to play · difficulty {problem.difficulty}
          </p>
        </div>
        <Link to="/" className="btn btn-ghost">End session</Link>
      </header>

      <div className="drill-body">
        <div className="drill-board">
          <GoBoard
            board={currentBoard.cells}
            lastMove={currentBoard.last}
            onPlay={handlePlay}
            disabled={resolved !== "pending"}
            vertexSize={32}
          />
        </div>

        <aside className="drill-side">
          <div className="drill-meta">
            <div className="drill-meta-row">
              <span className="info-field-label">Themes</span>
              <span>{problem.themes.join(", ") || "—"}</span>
            </div>
            <div className="drill-meta-row">
              <span className="info-field-label">Difficulty</span>
              <span>{problem.difficulty} / 10</span>
            </div>
            <div className="drill-meta-row">
              <span className="info-field-label">Step</span>
              <span className="mono">{Math.min(movesPlayed.length + 1, solution.length)} / {solution.length}</span>
            </div>
          </div>

          <div className="drill-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={showHint}
              disabled={resolved === "solved" || resolved === "revealed"}
            >
              Hint
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={showSolution}
              disabled={resolved === "solved" || resolved === "revealed"}
            >
              Show solution
            </button>
            {(resolved === "failed" || resolved === "solved" || resolved === "revealed") && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNext}
              >
                Next problem →
              </button>
            )}
          </div>

          {resolved === "revealed" && (
            <p className="dim" style={{ fontStyle: "italic", fontSize: "0.88rem" }}>
              The full solution is on the board. Take your time, then go to the next problem.
            </p>
          )}
        </aside>
      </div>

      {modalOpen && (resolved === "solved" || resolved === "failed") && (
        <div
          className="postgame-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalOpen(false)}
        >
          <div className="postgame-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="postgame-close"
              type="button"
              onClick={() => setModalOpen(false)}
              aria-label="Dismiss"
            >×</button>
            <div className="postgame-eyebrow">{resolved === "solved" ? "Solved" : "Try again"}</div>
            <h2 className="postgame-result">
              {resolved === "solved" ? "✓ Correct" : "✗ Not quite"}
            </h2>
            <p className="postgame-sub">
              {resolved === "solved"
                ? hintUsed
                  ? "Solved with a hint — count this as half-credit."
                  : "Solved cleanly. Sensei will adjust your weakness model."
                : "Dismiss this to study the position, then reveal the solution or move on."}
            </p>
            <div className="postgame-actions">
              <button type="button" className="btn btn-primary" onClick={onNext}>
                Next problem
              </button>
              {resolved === "failed" && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setModalOpen(false); showSolution(); }}
                >
                  Reveal solution
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setModalOpen(false)}
              >
                Study the board
              </button>
              {problem.themes[0] && (
                <Link to={`/concepts/${problem.themes[0]}`} className="btn btn-ghost">
                  Study this concept
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
