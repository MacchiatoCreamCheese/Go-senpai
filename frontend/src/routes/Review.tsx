import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  fetchGame,
  getGameAnalysis,
  getMoveOwnership,
  getReview,
  generateReview,
  triggerAnalyze,
  type MoveFeature,
} from "../api";
import type { GhostStone } from "../GoBoard";
import { GoBoard } from "../GoBoard";
import { MoveScrubber } from "../components/MoveScrubber";
import { ScoreLineChart } from "../components/ScoreLineChart";
import { boardAtMove, formatCoord, parseCoord } from "../lib/replay";
import type { MoveT } from "../types";

function moveTier(f: MoveFeature | undefined): "good" | "ok" | "bad" {
  if (!f || f.points_lost == null) return "good";
  if (f.is_blunder || f.points_lost >= 2) return "bad";
  if (f.points_lost >= 0.5) return "ok";
  return "good";
}

const TIER_COLOR: Record<string, string> = {
  good: "var(--tier-good)",
  ok:   "var(--tier-ok)",
  bad:  "var(--tier-bad)",
};

const USER_ID_KEY = "senpai_user_id";

type ReviewTab = "review" | "analysis" | "info";

export default function Review() {
  const { gameId = "" } = useParams<{ gameId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const moveParam = parseInt(searchParams.get("move") ?? "", 10);
  const userId = localStorage.getItem(USER_ID_KEY) ?? "";
  const queryClient = useQueryClient();

  const [reviewTab, setReviewTab] = useState<ReviewTab>("review");

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

  const reviewQuery = useQuery({
    queryKey: ["review", gameId, userId],
    queryFn: () => getReview(gameId, userId),
    enabled: !!gameId && !!userId,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: (force: boolean) => generateReview(gameId, userId, force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review", gameId, userId] });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: () => triggerAnalyze(gameId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis", gameId] });
    },
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
    if (w <= 0 && h <= 0) return 480;
    if (w > 0 && h > 0) return Math.max(MIN, Math.floor(Math.min(w, h) - pad * 2));
    return Math.max(MIN, Math.floor((w > 0 ? w : h) - pad * 2));
  }, [boardSlotSize]);

  const overlayTop = useMemo(() => {
    if (!showTopMove || !game.data) return null;
    const f = featuresByMove.get(currentMove + 1);
    if (!f?.top_move) return null;
    return parseCoord(f.top_move, game.data.size);
  }, [showTopMove, game.data, featuresByMove, currentMove]);

  const currentFeature = featuresByMove.get(currentMove);

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

  const reviewData = reviewQuery.data ?? null;
  const reviewLoading = reviewQuery.isLoading;

  return (
    <div style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: "1fr 400px",
      gap: 16,
      padding: 18,
      overflow: "hidden",
      boxSizing: "border-box",
    }}>

      {/* ── LEFT: board column ── */}
      <div style={{
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 10,
        minWidth: 0,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Link to={`/games/${gameId}`} className="viewer-back-link">← Games</Link>
            <span className="gs-tag" style={{ background: "var(--pastel-pink)" }}>REVIEW</span>
            {game.data && (
              <>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginLeft: 4 }}>
                  Game #{gameId.slice(0, 6)}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>
                  · {game.data.size}×{game.data.size} · komi {game.data.komi}
                </span>
                {game.data.state.result && (
                  <span className="gs-pill gs-pill--mint">{game.data.state.result}</span>
                )}
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="gs-btn" style={{ padding: "6px 12px", fontSize: 12 }}>↓ SGF</button>
          </div>
        </div>

        {/* Board card */}
        {game.isLoading ? (
          <div className="viewer-stage-loading">Loading game…</div>
        ) : game.error || !game.data || !replay ? (
          <div className="viewer-stage-error">Couldn&apos;t load game.</div>
        ) : (
          <div className="gs-card" style={{
            padding: 12,
            background: "var(--bg-2)",
            boxShadow: "var(--shadow-block)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}>
            {/* Chips row */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 6, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6 }}>
                <span className="gs-pill gs-pill--red">MOVE {currentMove}/{totalMoves}</span>
                {currentFeature && currentFeature.points_lost != null && (
                  <span className="gs-pill gs-pill--cyan">
                    {currentFeature.color} · −{Math.abs(currentFeature.points_lost).toFixed(1)} pt
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className={`gs-btn${showTopMove && !!analysis.data ? " gs-btn--primary" : ""}`}
                  style={{ padding: "4px 8px", fontSize: 10 }}
                  disabled={!analysis.data}
                  title={!analysis.data ? "Run analysis first" : "Top move"}
                  onClick={() => setShowTopMove((v) => !v)}
                >
                  top move
                </button>
                <button
                  className={`gs-btn${showOwnership && !!analysis.data ? " gs-btn--primary" : ""}`}
                  style={{ padding: "4px 8px", fontSize: 10 }}
                  disabled={!analysis.data}
                  title={!analysis.data ? "Run analysis first" : "Ownership"}
                  onClick={() => setShowOwnership((v) => !v)}
                >
                  ownership
                </button>
              </div>
            </div>

            {/* Board */}
            <div
              ref={boardSlotRef}
              style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 0 }}
            >
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
      </div>

      {/* ── RIGHT: tabbed rail (Review | Analysis | Info) ── */}
      <div className="review-rail">
        {/* Tab strip */}
        <div className="play-side-tabs review-tab-strip" role="tablist">
          {(["review", "analysis", "info"] as ReviewTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={reviewTab === t}
              tabIndex={reviewTab === t ? 0 : -1}
              className="play-side-tab"
              style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 11 }}
              onClick={() => setReviewTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        <div className="review-rail-body">
          {reviewTab === "review" && (
            <ReviewPanel
              gameId={gameId}
              userId={userId}
              reviewData={reviewData}
              loading={reviewLoading}
              generating={generateMutation.isPending}
              onGenerate={() => generateMutation.mutate(false)}
              onRegenerate={() => generateMutation.mutate(true)}
              onShowMove={setMove}
            />
          )}

          {reviewTab === "analysis" && (
            <AnalysisMoveList
              moves={game.data?.state.moves ?? []}
              boardSize={game.data?.size ?? 9}
              currentMove={currentMove}
              totalMoves={totalMoves}
              featuresByMove={featuresByMove}
              hasAnalysis={!!analysis.data}
              analyzing={analyzeMutation.isPending}
              onGoToMove={setMove}
              onRunAnalysis={() => analyzeMutation.mutate()}
            />
          )}

          {reviewTab === "info" && (
            <InfoPanel game={game.data ?? null} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── ReviewPanel ─────────────────────────────────────────────────────────────

function ReviewPanel({
  reviewData,
  loading,
  generating,
  onGenerate,
  onRegenerate,
  onShowMove,
}: {
  gameId: string;
  userId: string;
  reviewData: Awaited<ReturnType<typeof getReview>>;
  loading: boolean;
  generating: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
  onShowMove: (n: number) => void;
}) {
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading review…
      </div>
    );
  }

  if (!reviewData) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <div className="gs-tag" style={{ background: "var(--pastel-lavender)" }}>NO REVIEW YET</div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", fontFamily: "var(--font-body)", lineHeight: 1.5, margin: 0 }}>
          Generate an AI-powered review of your game to see key moments and improvement suggestions.
        </p>
        <button
          className="gs-btn gs-btn--primary"
          onClick={onGenerate}
          disabled={generating}
          style={{ padding: "8px 18px" }}
        >
          {generating ? "Generating…" : "Generate review"}
        </button>
      </div>
    );
  }

  const date = new Date(reviewData.generated_at).toLocaleString([], {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "2px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0, gap: 8,
      }}>
        <div>
          <div className="gs-tag" style={{ marginBottom: 4 }}>REVIEWED FOR YOU</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)" }}>
            {reviewData.model} · {date}
          </div>
        </div>
        <button
          className="gs-btn"
          style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }}
          onClick={onRegenerate}
          disabled={generating}
        >
          {generating ? "…" : "Regenerate"}
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 14px 20px" }}>
        {/* Summary */}
        <p style={{
          fontFamily: "var(--font-body)", fontSize: 13.5, lineHeight: 1.65,
          color: "var(--ink)", marginBottom: 18,
        }}>
          {reviewData.summary_md}
        </p>

        {/* Moment cards */}
        {reviewData.moments.map((moment) => {
          const tierLabel =
            moment.kind === "blunder" ? "BLUNDER" :
            moment.kind === "mistake" ? "MISTAKE" :
            moment.kind === "inaccuracy" ? "INACCURACY" :
            moment.kind.toUpperCase();
          const isBad = moment.kind === "blunder" || moment.kind === "mistake";
          const pillClass = isBad ? "gs-pill gs-pill--red" : "gs-pill gs-pill--yellow";

          return (
            <div key={moment.move_number} className="review-moment-card">
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: "var(--ink-mute)" }}>
                  Move {moment.move_number}
                </span>
                <span className={pillClass} style={{ fontSize: 10 }}>
                  {tierLabel} · −{Math.abs(moment.points_lost).toFixed(1)} pts
                </span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12 }}>
                  {moment.color === "B" ? "●" : "○"} {moment.coord}
                  {moment.top_move && <> → {moment.top_move}</>}
                </span>
              </div>

              {/* Explanation */}
              <p style={{
                fontFamily: "var(--font-body)", fontSize: 12.5, lineHeight: 1.6,
                color: "var(--ink-soft)", margin: "0 0 10px",
              }}>
                {moment.explanation_md}
              </p>

              {/* Show on board */}
              <button
                type="button"
                onClick={() => onShowMove(moment.move_number)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12,
                  color: "var(--border-deep)", padding: 0,
                }}
              >
                Show on board →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── AnalysisMoveList ────────────────────────────────────────────────────────

function AnalysisMoveList({
  moves,
  boardSize,
  currentMove,
  totalMoves,
  featuresByMove,
  hasAnalysis,
  analyzing,
  onGoToMove,
  onRunAnalysis,
}: {
  moves: MoveT[];
  boardSize: number;
  currentMove: number;
  totalMoves: number;
  featuresByMove: Map<number, MoveFeature>;
  hasAnalysis: boolean;
  analyzing: boolean;
  onGoToMove: (n: number) => void;
  onRunAnalysis: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const tierMoveNumbers = useMemo(() => {
    const yellow: number[] = [];
    const red: number[] = [];
    for (let mn = 1; mn <= moves.length; mn++) {
      const t = moveTier(featuresByMove.get(mn));
      if (t === "bad") red.push(mn);
      else if (t === "ok") yellow.push(mn);
    }
    return { yellow, red };
  }, [moves, featuresByMove]);

  // j/k to cycle through yellow/red moves
  useEffect(() => {
    const all = [...tierMoveNumbers.red, ...tierMoveNumbers.yellow].sort((a, b) => a - b);
    if (all.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j") {
        const next = all.find((mn) => mn > currentMove) ?? all[0];
        onGoToMove(next);
      } else if (e.key === "k") {
        const prev = [...all].reverse().find((mn) => mn < currentMove) ?? all[all.length - 1];
        onGoToMove(prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tierMoveNumbers, currentMove, onGoToMove]);

  // Scroll current row into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-mn="${currentMove}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [currentMove]);

  const counts = useMemo(() => {
    let good = 0, ok = 0, bad = 0;
    for (let mn = 1; mn <= moves.length; mn++) {
      const t = moveTier(featuresByMove.get(mn));
      if (t === "good") good++;
      else if (t === "ok") ok++;
      else bad++;
    }
    return { good, ok, bad };
  }, [moves, featuresByMove]);

  if (totalMoves === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        No moves yet.
      </div>
    );
  }

  if (!hasAnalysis) {
    return (
      <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <div className="gs-tag" style={{ background: "var(--pastel-lavender)" }}>NO ANALYSIS YET</div>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", fontFamily: "var(--font-body)", lineHeight: 1.5, margin: 0 }}>
          Run KataGo analysis to see move quality, top moves, and score data.
        </p>
        <button
          className="gs-btn gs-btn--primary"
          onClick={onRunAnalysis}
          disabled={analyzing}
          style={{ padding: "8px 18px" }}
        >
          {analyzing ? "Running analysis…" : "Run analysis"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "2px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <span className="gs-tag">MOVES · {totalMoves}</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["good", "ok", "bad"] as const).map((t) => (
            <span key={t} className="gs-pill" style={{ background: "var(--bg)", padding: "3px 10px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: TIER_COLOR[t], border: "1px solid var(--ink)", flexShrink: 0 }} />
              {counts[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="analysis-move-header">
        <span>#</span>
        <span style={{ gridColumn: "2 / 4" }}>PLAYED</span>
        <span>TOP</span>
        <span>LOST</span>
        <span>PHASE</span>
      </div>

      {/* Rows */}
      <div ref={listRef} style={{ overflow: "auto", flex: 1 }}>
        {moves.map((move, i) => {
          const mn = i + 1;
          const feature = featuresByMove.get(mn);
          const tier = moveTier(feature);
          const isCurrent = currentMove === mn;
          const coord =
            move.kind === "pass" ? "pass" :
            move.kind === "resign" ? "resign" :
            move.point ? formatCoord(move.point.row, move.point.col, boardSize) : "—";
          const topMove = feature?.top_move ?? "—";
          const lost = feature?.points_lost != null && feature.points_lost > 0
            ? feature.points_lost.toFixed(1)
            : "0.0";
          const phase = feature?.phase ?? "—";

          return (
            <button
              key={mn}
              type="button"
              data-mn={mn}
              onClick={() => onGoToMove(mn)}
              className={`analysis-move-row${tier === "bad" ? " analysis-move-row--bad" : ""}${isCurrent ? " analysis-move-row--current" : ""}`}
            >
              <span className="analysis-move-num">{mn}.</span>
              <span className="analysis-stone-dot" style={{
                width: 10, height: 10, borderRadius: 99,
                background: move.color === "B" ? "var(--ink)" : "var(--bg-2)",
                border: "1.5px solid var(--ink)",
                display: "inline-block", flexShrink: 0,
              }} />
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12 }}>{coord}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-soft)" }}>{topMove}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: tier === "bad" ? "var(--tier-bad)" : tier === "ok" ? "var(--tier-ok)" : "var(--ink-mute)" }}>
                {lost}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", textTransform: "lowercase" }}>{phase}</span>
              <span style={{
                width: 8, height: 8, borderRadius: 99,
                background: TIER_COLOR[tier],
                border: "1px solid var(--ink)",
                flexShrink: 0, display: "inline-block",
                justifySelf: "center",
              }} />
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 14px",
        borderTop: "2px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0, gap: 8,
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)" }}>
          {totalMoves} moves shown · j/k to cycle yellow/red
        </span>
        <button
          className="gs-btn"
          style={{ padding: "5px 10px", fontSize: 11, flexShrink: 0 }}
          disabled={analyzing}
          onClick={onRunAnalysis}
        >
          {analyzing ? "Running…" : "Re-run analysis"}
        </button>
      </div>
    </div>
  );
}

// ── InfoPanel ───────────────────────────────────────────────────────────────

function InfoPanel({ game }: { game: Awaited<ReturnType<typeof fetchGame>> | null }) {
  if (!game) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        Loading…
      </div>
    );
  }

  const rows: [string, string][] = [
    ["Board size", `${game.size}×${game.size}`],
    ["Komi", String(game.komi)],
    ["Result", game.state.result ?? "—"],
    ["Opponent", game.opponent_type === "ai" ? `KataGo ${game.ai_rank ?? "?"}k` : "Human"],
    ["Black", game.black_user_id?.slice(0, 8) ?? "—"],
    ["White", game.white_user_id?.slice(0, 8) ?? "—"],
    ["Moves", String(game.state.moves.length)],
  ];

  return (
    <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span className="gs-tag" style={{ marginBottom: 4 }}>GAME INFO</span>
      {rows.map(([label, value]) => (
        <div key={label} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "7px 10px",
          background: "var(--bg-2)",
          border: "1.5px solid var(--border)",
          borderRadius: 8,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}
