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
import { useChatStream } from "../hooks/useChatStream";
import type { MoveT } from "../types";
import { COACH_PRESET_MODES } from "../constants/coachModes";

const USER_ID_KEY = "senpai_user_id";

const SENSEI_MODES = [...COACH_PRESET_MODES];

export default function GameViewer() {
  const { gameId = "" } = useParams<{ gameId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const moveParam = parseInt(searchParams.get("move") ?? "", 10);
  const userId = localStorage.getItem(USER_ID_KEY) ?? "";

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

  const overlayTop = useMemo(() => {
    if (!showTopMove || !game.data) return null;
    const f = featuresByMove.get(currentMove + 1);
    if (!f?.top_move) return null;
    return parseCoord(f.top_move, game.data.size);
  }, [showTopMove, game.data, featuresByMove, currentMove]);

  useEffect(() => {
    if (!showOwnership || !gameId || currentMove < 1) {
      setOwnershipRaw(null);
      return;
    }
    let cancelled = false;
    getMoveOwnership(gameId, currentMove).then((data) => {
      if (!cancelled) setOwnershipRaw(data);
    }).catch(() => {
      if (!cancelled) setOwnershipRaw(null);
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
          <Link to={`/games/${gameId}/review`} className="gs-btn gs-btn--primary" style={{ padding: "6px 12px", fontSize: 12 }}>
            Review & analysis
          </Link>
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
              <div className="viewer-chart-scrub-stack">
                <ScoreLineChart
                  points={scorePoints}
                  currentMove={currentMove}
                  onScrub={setMove}
                  width={640}
                  height={80}
                />
                <MoveScrubber current={currentMove} total={totalMoves} onChange={setMove} />
              </div>
            </footer>
          </div>
        )}
      </section>

      <aside className="viewer-rail" aria-label="Sensei and moves">
        <ViewerSenseiChat gameId={gameId} userId={userId} />

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

export function ViewerSenseiChat({ gameId, userId }: { gameId: string; userId: string }) {
  const { messages, isStreaming, send, reset } = useChatStream(gameId, userId);
  const [input, setInput] = useState("");
  const [aiError, setAiError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === "assistant" && last.text.startsWith("Error")) {
        setAiError(true);
      }
    }
  }, [isStreaming, messages]);

  const handleMode = (mode: string) => { if (!isStreaming) send(mode); };
  const handleFollowup = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    send("followup", text);
    setInput("");
  };

  const hasMessages = messages.length > 0;

  return (
    <section className="viewer-rail-chat gs-card gs-card--ink" aria-label="Ask Sensei">
      <div className="viewer-sensei-head">
        <span className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>ASK SENSEI · 先生</span>
        <span className={`gs-pill ${isStreaming ? "gs-pill--yellow" : "gs-pill--mint"}`} style={{ fontSize: 10 }}>
          {isStreaming ? "thinking…" : "ready"}
        </span>
      </div>

      {aiError && (
        <div className="viewer-sensei-unavailable">
          <p>Sensei AI is currently unavailable.</p>
          <button type="button" className="gs-btn" onClick={() => { reset(); setAiError(false); }}>retry</button>
        </div>
      )}

      {!aiError && !hasMessages && (
        <div className="viewer-sensei-modes">
          {SENSEI_MODES.map((m) => (
            <button key={m.id} type="button" className="gs-btn" style={{ textAlign: "left", justifyContent: "flex-start" }}
              onClick={() => handleMode(m.id)} disabled={isStreaming}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {!aiError && hasMessages && (
        <div className="viewer-sensei-thread" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div key={i} className={`viewer-sensei-bubble viewer-sensei-bubble--${msg.role}`}>
              {msg.streaming && !msg.text
                ? <span className="viewer-sensei-thinking">thinking…</span>
                : msg.text}
              {msg.streaming && msg.text && <span className="chat-cursor" aria-hidden />}
            </div>
          ))}
        </div>
      )}

      {!aiError && hasMessages && (
        <div className="viewer-sensei-compose">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFollowup(); }
            }}
            placeholder="Ask a follow-up…"
            disabled={isStreaming}
            className="viewer-sensei-input"
          />
          <button type="button" className="gs-btn gs-btn--primary"
            onClick={handleFollowup} disabled={isStreaming || !input.trim()}
            style={{ padding: "6px 10px", fontSize: 11 }}>↵</button>
        </div>
      )}
    </section>
  );
}

export function moveLabel(m: MoveT, size: number): string {
  if (m.kind === "pass") return "pass";
  if (m.kind === "resign") return "resign";
  if (!m.point) return "—";
  return formatCoord(m.point.row, m.point.col, size);
}

export function ViewerPairedMoves({
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
      <div className="viewer-movelist-head">
        <span className="gs-tag">MOVES · {totalMoves}</span>
      </div>
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
