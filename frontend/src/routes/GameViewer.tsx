import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  fetchGame,
  getGameAnalysis,
  getMoveOwnership,
  type MoveFeature,
} from "../api";
import type { GhostStone } from "../GoBoard";
import { GoBoard } from "../GoBoard";
import { MoveScrubber } from "../components/MoveScrubber";
import { EngineOverlay } from "../components/EngineOverlay";
import { ScoreLineChart } from "../components/ScoreLineChart";
import { boardAtMove, formatCoord, parseCoord } from "../lib/replay";
import type { MoveT } from "../types";

export default function GameViewer() {
  const { gameId = "" } = useParams<{ gameId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const moveParam = parseInt(searchParams.get("move") ?? "", 10);

  const game = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => fetchGame(gameId),
    enabled: !!gameId,
  });

  const analysis = useQuery({
    queryKey: ["analysis", gameId],
    queryFn: () => getGameAnalysis(gameId),
    enabled: !!gameId,
  });

  const [showTopMove, setShowTopMove] = useState(true);
  const [showOwnership, setShowOwnership] = useState(false);
  const [ownershipRaw, setOwnershipRaw] = useState<number[] | null>(null);

  const totalMoves = game.data?.state.moves.length ?? 0;
  const currentMove = isNaN(moveParam)
    ? totalMoves
    : Math.max(0, Math.min(totalMoves, moveParam));

  function setMove(n: number) {
    const next = new URLSearchParams(searchParams);
    next.set("move", String(n));
    setSearchParams(next, { replace: true });
  }

  const replay = useMemo(() => {
    if (!game.data) return null;
    return boardAtMove(game.data.size, game.data.state.moves, currentMove);
  }, [game.data, currentMove]);

  const featuresByMove = useMemo(() => {
    const map = new Map<number, MoveFeature>();
    for (const f of analysis.data?.features ?? []) map.set(f.move_number, f);
    return map;
  }, [analysis.data]);

  // Score line: derive Black's score lead per move from score_before, normalised
  // by colour-to-play. KataGo's score_before is from the perspective of the
  // colour about to play; flip when it's White's turn so the curve is always
  // "Black ahead = positive".
  const scorePoints = useMemo(() => {
    const fs = analysis.data?.features ?? [];
    return fs
      .filter((f) => f.score_before != null)
      .map((f) => ({
        move: f.move_number - 1,
        scoreLead: (f.color === "B" ? 1 : -1) * (f.score_before ?? 0),
      }));
  }, [analysis.data]);

  const boardSlotRef = useRef<HTMLDivElement>(null);
  const [boardSlotSize, setBoardSlotSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = boardSlotRef.current;
    if (!el) return;
    const sync = () => {
      const box = boardSlotRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      setBoardSlotSize({ w: r.width, h: r.height });
    };
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setBoardSlotSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    sync();
    requestAnimationFrame(sync);
    return () => ro.disconnect();
  }, [game.data?.id, game.isLoading]);

  const boardWidth = useMemo(() => {
    const MIN = 200;
    const pad = 4;
    const { w, h } = boardSlotSize;
    if (w <= 0 && h <= 0) return 520;
    if (w > 0 && h > 0) {
      return Math.max(MIN, Math.floor(Math.min(w, h) - pad * 2));
    }
    return Math.max(MIN, Math.floor((w > 0 ? w : h) - pad * 2));
  }, [boardSlotSize]);

  // Top-move overlay for the position about to be played at currentMove + 1
  // (i.e. the move immediately after the displayed board state).
  const overlayTop = useMemo(() => {
    if (!showTopMove || !game.data) return null;
    const f = featuresByMove.get(currentMove + 1);
    if (!f?.top_move) return null;
    return parseCoord(f.top_move, game.data.size);
  }, [showTopMove, game.data, featuresByMove, currentMove]);

  // Fetch ownership from the backend when the toggle is on or the move changes.
  useEffect(() => {
    if (!showOwnership || !gameId || currentMove < 1) {
      setOwnershipRaw(null);
      return;
    }
    let cancelled = false;
    getMoveOwnership(gameId, currentMove).then((data) => {
      if (!cancelled) setOwnershipRaw(data);
    });
    return () => { cancelled = true; };
  }, [showOwnership, gameId, currentMove]);

  const ownershipGhosts = useMemo((): (GhostStone | null)[][] | undefined => {
    if (!ownershipRaw || !game.data) return undefined;
    const size = game.data.size;
    return Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => {
        const v = ownershipRaw[row * size + col];
        if (v > 0.5)  return { sign:  1 as const, type: "good" as const, faint: true };
        if (v < -0.5) return { sign: -1 as const, type: "good" as const, faint: true };
        return null;
      }),
    );
  }, [ownershipRaw, game.data]);

  return (
    <div className="viewer-page viewer-page--chess">
      <section className="viewer-stage" aria-label="Board">
        <header className="viewer-stage-header">
          <Link to="/games" className="viewer-back-link">← Games</Link>
          <h1 className="viewer-stage-title">Game #{gameId.slice(0, 6)}</h1>
          {game.data && (
            <div className="viewer-stage-meta">
              <span className="gs-tag">{game.data.size}×{game.data.size}</span>
              <span className="gs-tag">komi {game.data.komi}</span>
              {game.data.state.result && (
                <span className="gs-pill gs-pill--mint">{game.data.state.result}</span>
              )}
            </div>
          )}
        </header>

        {game.isLoading ? (
          <div className="viewer-stage-loading">Loading game…</div>
        ) : game.error || !game.data || !replay ? (
          <div className="viewer-stage-error">Couldn&apos;t load game.</div>
        ) : (
          <div className="viewer-stage-body">
            <div className="viewer-board-stack">
              <div className="viewer-board-chips">
                <EngineOverlay
                  toggles={[
                    { id: "top", label: "Top move", enabled: showTopMove, available: !!analysis.data, hint: "Run analysis first" },
                    { id: "own", label: "Ownership", enabled: showOwnership, available: !!analysis.data, hint: "Run analysis first" },
                  ]}
                  onToggle={(id, v) => {
                    if (id === "top") setShowTopMove(v);
                    if (id === "own") setShowOwnership(v);
                  }}
                />
              </div>
              <div className="viewer-board-slot" ref={boardSlotRef}>
                <GoBoard
                  width={boardWidth}
                  board={replay.cells}
                  lastMove={replay.last}
                  topMove={overlayTop}
                  ownershipGhosts={ownershipGhosts}
                  disabled
                  showCoordinates
                />
              </div>
            </div>

            <footer className="viewer-stage-footer">
              <ScoreLineChart
                points={scorePoints}
                currentMove={currentMove}
                onScrub={setMove}
                height={80}
              />
              <MoveScrubber current={currentMove} total={totalMoves} onChange={setMove} />
            </footer>
          </div>
        )}
      </section>

      <aside className="viewer-rail" aria-label="Sensei chat and moves">
        <ViewerSenseiChatCard gameShortId={gameId.slice(0, 8)} />

        <section className="viewer-rail-moves gs-card gs-card--tight">
          {game.data ? (
            <ViewerPairedMoves
              moves={game.data.state.moves}
              boardSize={game.data.size}
              currentMove={currentMove}
              totalMoves={totalMoves}
              onGoToMove={setMove}
            />
          ) : (
            <div className="viewer-movelist viewer-movelist--empty">
              <span className="dim">Moves load with the game…</span>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

/** Ask Sensei — viewer rail chat (styled like design mock). */
function ViewerSenseiChatCard({ gameShortId }: { gameShortId: string }) {
  return (
    <section
      className="viewer-rail-chat sensei-chat-card gs-card gs-card--ink"
      aria-label="Ask Sensei"
    >
      <header className="sensei-chat-head">
        <div className="sensei-chat-avatar" aria-hidden>
          <span className="sensei-chat-avatar-mark">先</span>
        </div>
        <div className="sensei-chat-head-copy">
          <h2 className="sensei-chat-title">Ask Sensei</h2>
        </div>
        <span className="sensei-chat-live">streaming</span>
      </header>

      <div className="sensei-chat-rule" role="presentation" />

      <div className="sensei-chat-thread" role="log" aria-live="polite">
        <div className="sensei-chat-bubble sensei-chat-bubble--sensei">
          <p className="sensei-chat-copy">
            You&apos;re ahead on territory, but the group around{" "}
            <span className="sensei-chat-coord">F4</span> is thinner than it
            feels. Ask yourself:
          </p>
          <ol className="sensei-chat-list">
            <li>If White plays <span className="sensei-chat-coord">G6</span>, can you answer with thickness instead of greed?</li>
            <li>Would an empty triangle here actually cost you nothing long-term?</li>
          </ol>
          <p className="sensei-chat-copy sensei-chat-copy-muted">
            (Light demo copy — wired chat arrives next.)
          </p>
          <div className="sensei-chat-inline-actions">
            <button type="button" className="sensei-chat-pill-btn" disabled>
              what&apos;s missing?
            </button>
            <button type="button" className="sensei-chat-pill-btn sensei-chat-pill-btn--primary" disabled>
              show follow-up sequence
            </button>
          </div>
        </div>

        <div className="sensei-chat-bubble sensei-chat-bubble--user">
          <p className="sensei-chat-copy">explain the cut at move 73 like I&apos;m 12k?</p>
        </div>

        <div className="sensei-chat-bubble sensei-chat-bubble--think">
          <p className="sensei-chat-think-dots">… counting liberties …</p>
        </div>
      </div>

      <div className="sensei-chat-rule" role="presentation" />

      <div className="sensei-chat-fill" aria-hidden />

      <footer className="sensei-chat-foot">
        <div className="sensei-chat-compose-row">
          <label className="visually-hidden" htmlFor="sensei-chat-input">
            Message Sensei
          </label>
          <input
            id="sensei-chat-input"
            className="sensei-chat-input"
            type="text"
            placeholder="Ask about this fight…"
            disabled
            readOnly
            aria-describedby="sensei-chat-input-hint"
          />
          <button type="button" className="sensei-chat-send" disabled aria-label="Send message">
            <span>send</span>
            <span className="sensei-chat-send-icon" aria-hidden>
              ↵
            </span>
          </button>
        </div>
        <div className="sensei-chat-quick" role="group" aria-label="Quick prompts">
          {(["plan", "read fight", "tesuji?", "next move"] as const).map((q) => (
            <button key={q} type="button" className="sensei-chat-chip" disabled>
              {q}
            </button>
          ))}
        </div>
      </footer>
    </section>
  );
}

function moveLabel(m: MoveT, size: number): string {
  if (m.kind === "pass") return "pass";
  if (m.kind === "resign") return "resign";
  if (!m.point) return "—";
  return formatCoord(m.point.row, m.point.col, size);
}

function ViewerPairedMoves({
  moves,
  boardSize,
  currentMove,
  totalMoves,
  onGoToMove,
}: {
  moves: MoveT[];
  boardSize: number;
  currentMove: number;
  totalMoves: number;
  onGoToMove: (n: number) => void;
}) {
  const rows = useMemo(() => {
    const out: { num: number; black?: MoveT; white?: MoveT }[] = [];
    for (let i = 0; i < moves.length; i += 2) {
      out.push({
        num: i / 2 + 1,
        black: moves[i],
        white: moves[i + 1],
      });
    }
    return out;
  }, [moves]);

  if (totalMoves === 0) {
    return (
      <div className="viewer-movelist viewer-movelist--empty">
        <span className="dim">No moves yet.</span>
      </div>
    );
  }

  return (
    <div className="viewer-movelist">
      <div className="viewer-movelist-head">Moves</div>
      <div className="viewer-movelist-body">
        {rows.map((row) => {
          const blackMn = row.num * 2 - 1;
          const whiteMn = row.num * 2;
          return (
            <div key={row.num} className="viewer-movelist-row">
              <span className="viewer-movelist-num">{row.num}.</span>
              <button
                type="button"
                className={`viewer-movelist-ply${currentMove === blackMn ? " is-current" : ""}`}
                disabled={!row.black}
                onClick={() => row.black && onGoToMove(blackMn)}
              >
                {row.black ? moveLabel(row.black, boardSize) : "…"}
              </button>
              <button
                type="button"
                className={`viewer-movelist-ply${currentMove === whiteMn ? " is-current" : ""}`}
                disabled={!row.white}
                onClick={() => row.white && onGoToMove(whiteMn)}
              >
                {row.white ? moveLabel(row.white, boardSize) : ""}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
