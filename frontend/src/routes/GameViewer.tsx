import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchGame,
  generateReview,
  getGameAnalysis,
  getMoveOwnership,
  getReview,
  sgfUrl,
  triggerAnalyze,
  type MoveFeature,
  type ReviewResponse,
} from "../api";
import type { GhostStone } from "@sabaki/shudan";
import { GoBoard } from "../GoBoard";
import { MoveScrubber } from "../components/MoveScrubber";
import { EngineOverlay } from "../components/EngineOverlay";
import { ScoreLineChart } from "../components/ScoreLineChart";
import { MomentCard } from "../components/MomentCard";
import { MoveNotePopover } from "../components/MoveNotePopover";
import { TierDot, getTier } from "../components/TierDot";
import { useToast } from "../components/NotificationToast";
import { boardAtMove, parseCoord } from "../lib/replay";
import { renderMarkdown } from "../lib/markdown";
import { useIdentity } from "../lib/auth";
import type { MoveT } from "../types";

const AI_USER_ID = "00000000-0000-0000-0000-0000000000a1";

type TabId = "review" | "analysis" | "info";

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

  const { userId } = useIdentity();
  const review = useQuery({
    queryKey: ["review", gameId, userId],
    queryFn: () => (userId ? getReview(gameId, userId) : Promise.resolve(null)),
    enabled: !!gameId,
  });

  const [tab, setTab] = useState<TabId>("review");
  const [showTopMove, setShowTopMove] = useState(true);
  const [showOwnership, setShowOwnership] = useState(false);
  const [ownershipRaw, setOwnershipRaw] = useState<number[] | null>(null);
  const [blundersOnly, setBlundersOnly] = useState(false);
  const [sortKey, setSortKey] = useState<"move" | "lost">("move");

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
    <div className="viewer-page">
      {/* Board column */}
      <div className="viewer-left">
        <div className="viewer-header">
          <Link to="/games" className="gs-btn" style={{ padding: "6px 14px", fontSize: 12, textDecoration: "none" }}>← Games</Link>
          <div className="viewer-title">Game #{gameId.slice(0, 6)}</div>
          {game.data && (
            <>
              <span className="gs-tag">{game.data.size}×{game.data.size}</span>
              <span className="gs-tag">komi {game.data.komi}</span>
              {game.data.state.result && (
                <span className="gs-pill gs-pill--mint">{game.data.state.result}</span>
              )}
            </>
          )}
        </div>

        {game.isLoading ? (
          <div style={{ padding: 20, color: "var(--ink-mute)", fontFamily: "var(--font-display)" }}>Loading game…</div>
        ) : game.error || !game.data || !replay ? (
          <div style={{ padding: 20, color: "var(--tier-bad)", fontFamily: "var(--font-display)" }}>Couldn't load game.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

            <GoBoard
              board={replay.cells}
              lastMove={replay.last}
              topMove={overlayTop}
              ownershipGhosts={ownershipGhosts}
              disabled
              showCoordinates
            />

            <MoveScrubber current={currentMove} total={totalMoves} onChange={setMove} />

            <ScoreLineChart points={scorePoints} currentMove={currentMove} onScrub={setMove} />
          </>
        )}
      </div>

      {/* Right panel */}
      <div className="viewer-right">
        <div style={{ display: "flex", gap: 6, borderBottom: "2.5px solid var(--border)", paddingBottom: 12, marginBottom: 4 }}>
          {(["review", "analysis", "info"] as TabId[]).map((t) => (
            <button
              key={t}
              className={`play-sidebar-tab${tab === t ? " is-active" : ""}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "review" && (
          <ReviewTab
            gameId={gameId}
            userId={userId}
            loading={review.isLoading}
            review={review.data ?? null}
            gameFinished={!!game.data?.state.result}
            currentMove={currentMove}
            boardSize={game.data?.size ?? 19}
            gameMoves={game.data?.state.moves ?? []}
            onShowOnBoard={(moveNumber) => setMove(Math.max(0, moveNumber - 1))}
          />
        )}
        {tab === "analysis" && (
          <AnalysisTab
            loading={analysis.isLoading}
            features={analysis.data?.features ?? null}
            currentMove={currentMove}
            onSelect={setMove}
            blundersOnly={blundersOnly}
            setBlundersOnly={setBlundersOnly}
            sortKey={sortKey}
            setSortKey={setSortKey}
            gameId={gameId}
            gameFinished={!!game.data?.state.result}
            userId={userId}
            boardSize={game.data?.size ?? 19}
          />
        )}
        {tab === "info" && game.data && (
          <InfoTab
            size={game.data.size}
            komi={game.data.komi}
            opponentType={game.data.opponent_type}
            aiRank={game.data.ai_rank}
            result={game.data.state.result}
            blackUserId={game.data.black_user_id}
            whiteUserId={game.data.white_user_id}
            gameId={gameId}
          />
        )}
      </div>
    </div>
  );
}

interface ReviewTabProps {
  gameId: string;
  userId: string | null;
  loading: boolean;
  review: ReviewResponse | null;
  gameFinished: boolean;
  currentMove: number;
  boardSize: number;
  gameMoves: MoveT[];
  onShowOnBoard: (moveNumber: number) => void;
}

function ReviewTab({
  gameId,
  userId,
  loading,
  review,
  gameFinished,
  currentMove,
  boardSize,
  gameMoves,
  onShowOnBoard,
}: ReviewTabProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const generate = useMutation({
    mutationFn: ({ force }: { force: boolean }) => {
      if (!userId) throw new Error("Sign in (set a name in the Lobby) before requesting a review.");
      return generateReview(gameId, userId, force);
    },
    onSuccess: (res) => {
      toast.push({
        kind: "success",
        title: "Review ready",
        body: `${res.moments.length} moment${res.moments.length === 1 ? "" : "s"} from ${res.model}.`,
      });
      queryClient.setQueryData(["review", gameId, userId], res);
    },
    onError: (err) => {
      toast.push({ kind: "error", title: "Review failed", body: String(err) });
    },
  });

  if (loading) return <div style={{ padding: 20, color: "var(--ink-mute)", fontFamily: "var(--font-display)" }}>Loading review…</div>;

  if (!userId) {
    return (
      <div className="gs-card" style={{ padding: 24, background: "var(--pastel-lavender)", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 48, marginBottom: 10 }}>評</div>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Sign in first</h2>
        <p style={{ fontSize: 13 }}>Reviews are written for one player at a time. Set a name in the Lobby, then come back.</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="gs-card" style={{ padding: 24, background: "var(--pastel-yellow)", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 48, marginBottom: 10 }}>評</div>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>No review yet</h2>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          {gameFinished
            ? "Generate a review for your perspective. Run analysis first if you haven't."
            : "Reviews are generated once a game has finished."}
        </p>
        {gameFinished && (
          <button
            className="gs-btn gs-btn--primary"
            onClick={() => generate.mutate({ force: false })}
            disabled={generate.isPending}
          >
            {generate.isPending ? "Generating (~30s)…" : "Generate review"}
          </button>
        )}
      </div>
    );
  }

  // Determine perspective from for_user_id matching one of the seats — but we
  // don't have the seats here, so just show the model + timestamp.
  const generatedAt = new Date(review.generated_at);
  const generatedLabel = generatedAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="review-tab">
      <div className="viewer-review-card" style={{ background: "var(--pastel-lavender)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="gs-tag" style={{ marginBottom: 6 }}>Reviewed for you</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>
              {review.model} · {generatedLabel}
            </div>
          </div>
          <button
            type="button"
            className="gs-btn"
            style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
            onClick={() => generate.mutate({ force: true })}
            disabled={generate.isPending}
          >
            {generate.isPending ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {review.summary_md && (
        <section
          className="review-summary"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(review.summary_md) }}
        />
      )}

      <div className="review-moments">
        {review.moments.length === 0 ? (
          <div className="review-empty-line">
            No notable moments — the model didn't flag anything for this perspective.
          </div>
        ) : (
          review.moments.map((m) => (
            <MomentCard
              key={`${m.move_number}-${m.coord}`}
              moment={m}
              currentMove={currentMove}
              boardSize={boardSize}
              moves={gameMoves}
              onShowOnBoard={() => onShowOnBoard(m.move_number)}
            />
          ))
        )}
      </div>

      <footer className="review-foot">
        <span className="dim">
          Feedback (helpful / not helpful) — coming with the eval phase.
        </span>
      </footer>
    </div>
  );
}

interface AnalysisTabProps {
  loading: boolean;
  features: MoveFeature[] | null;
  currentMove: number;
  onSelect: (n: number) => void;
  blundersOnly: boolean;
  setBlundersOnly: (v: boolean) => void;
  sortKey: "move" | "lost";
  setSortKey: (k: "move" | "lost") => void;
  gameId: string;
  gameFinished: boolean;
  userId: string | null;
  boardSize: number;
}

function AnalysisTab({
  loading,
  features,
  currentMove,
  onSelect,
  blundersOnly,
  setBlundersOnly,
  sortKey,
  setSortKey,
  gameId,
  gameFinished,
  userId,
  boardSize,
}: AnalysisTabProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [openNote, setOpenNote] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: () => triggerAnalyze(gameId),
    onSuccess: (res) => {
      const hits = res.cache_hits ?? 0;
      const hitsLine = hits > 0 ? ` · ${hits} position${hits === 1 ? "" : "s"} from cache` : "";
      toast.push({
        kind: "success",
        title: res.cached ? "Analysis already cached" : "Analysis complete",
        body: `${res.move_count} moves · ${res.katago_version}${hitsLine}`,
      });
      queryClient.invalidateQueries({ queryKey: ["analysis", gameId] });
    },
    onError: (err) => {
      toast.push({ kind: "error", title: "Analysis failed", body: String(err) });
    },
  });

  // These hooks must stay above all conditional returns (Rules of Hooks).
  const nonGreenMoves = useMemo(
    () =>
      !features
        ? []
        : [...features]
            .sort((a, b) => a.move_number - b.move_number)
            .filter((f) => getTier(f.points_lost, boardSize) !== "green")
            .map((f) => f.move_number),
    [features, boardSize],
  );

  useEffect(() => {
    if (!features) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenNote(null);
        return;
      }
      if (!["j", "n", "k", "p"].includes(e.key)) return;
      if (nonGreenMoves.length === 0) return;
      const cur = nonGreenMoves.indexOf(openNote ?? -1);
      if (e.key === "j" || e.key === "n") {
        const next = nonGreenMoves[(cur + 1) % nonGreenMoves.length];
        setOpenNote(next);
        onSelect(next - 1);
      } else {
        const prev =
          nonGreenMoves[(cur - 1 + nonGreenMoves.length) % nonGreenMoves.length];
        setOpenNote(prev);
        onSelect(prev - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNote, nonGreenMoves, onSelect, features]);

  if (loading) return <div style={{ padding: 20, color: "var(--ink-mute)", fontFamily: "var(--font-display)" }}>Loading analysis…</div>;

  if (!features) {
    return (
      <div className="gs-card" style={{ padding: 24, background: "var(--pastel-cyan)", textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 48, marginBottom: 10 }}>析</div>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>No analysis yet</h2>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          {gameFinished
            ? "Run KataGo over this game to see per-move points lost, top moves, and the score curve."
            : "Analysis is available once the game has finished."}
        </p>
        {gameFinished && (
          <button
            className="gs-btn gs-btn--primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Analysing…" : "Run analysis"}
          </button>
        )}
      </div>
    );
  }

  const sorted = [...features]
    .filter((f) => !blundersOnly || f.is_blunder)
    .sort((a, b) => {
      if (sortKey === "move") return a.move_number - b.move_number;
      return (b.points_lost ?? 0) - (a.points_lost ?? 0);
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={blundersOnly}
            onChange={(e) => setBlundersOnly(e.target.checked)}
          />
          Blunders only
        </label>
        <select
          className="styled-select"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as "move" | "lost")}
          style={{ fontSize: 13 }}
        >
          <option value="move">By move</option>
          <option value="lost">By points lost</option>
        </select>
      </div>

      <div style={{ overflow: "auto" }}>
        <table className="move-table">
          <thead>
            <tr>
              <th>#</th>
              <th></th>
              <th>Played</th>
              <th>Top</th>
              <th className="r">Lost</th>
              <th>Phase</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => {
              const isCurrent = f.move_number === currentMove;
              const isNoteOpen = openNote === f.move_number;
              return (
                <tr
                  key={f.move_number}
                  className={
                    (f.is_blunder ? "is-blunder " : "") +
                    (isCurrent ? "is-current" : "") +
                    (isNoteOpen ? " is-note-open" : "")
                  }
                  onClick={() => onSelect(f.move_number)}
                >
                  <td className="mono analysis-move-num">
                    <TierDot
                      feature={f}
                      boardSize={boardSize}
                      onClick={
                        userId
                          ? () => {
                              setOpenNote(isNoteOpen ? null : f.move_number);
                              onSelect(f.move_number);
                            }
                          : undefined
                      }
                    />
                    {f.move_number}
                  </td>
                  <td>
                    <span className={`stone-dot ${f.color === "B" ? "black" : "white"}`} />
                  </td>
                  <td className="mono">{f.coord}</td>
                  <td className="mono dim">{f.top_move ?? "—"}</td>
                  <td className="r mono">
                    {f.points_lost == null ? "—" : f.points_lost.toFixed(1)}
                  </td>
                  <td className="dim">{f.phase}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {openNote !== null && userId && (() => {
        const f = features.find((x) => x.move_number === openNote);
        const tier = f ? getTier(f.points_lost, boardSize) : null;
        if (!f || !tier || tier === "green") return null;
        return (
          <MoveNotePopover
            gameId={gameId}
            moveNumber={openNote}
            forUserId={userId}
            tier={tier}
            onShowOnBoard={() => onSelect(openNote)}
            onClose={() => setOpenNote(null)}
          />
        );
      })()}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, paddingTop: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>{sorted.length} moves shown</span>
        {nonGreenMoves.length > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)" }}>j/k to cycle</span>
        )}
        <button
          className="gs-btn"
          style={{ padding: "6px 12px", fontSize: 12 }}
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Re-analysing…" : "Re-run analysis"}
        </button>
      </div>
    </div>
  );
}

function InfoTab(props: {
  size: number;
  komi: number;
  opponentType: "human" | "ai";
  aiRank: number | null;
  result: string | null;
  blackUserId: string | null;
  whiteUserId: string | null;
  gameId: string;
}) {
  const toast = useToast();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="gs-card" style={{ padding: 16, background: "var(--bg-2)" }}>
        <Field label="Game ID"><span className="gs-tag">{props.gameId.slice(0, 8)}…</span></Field>
        <Field label="Board"><span>{props.size}×{props.size}</span></Field>
        <Field label="Komi"><span>{props.komi}</span></Field>
        <Field label="Opponent">
          <span>{props.opponentType === "ai" ? `Sensei AI · ${props.aiRank ?? "?"}k` : "Human"}</span>
        </Field>
        <Field label="Black"><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{shortId(props.blackUserId)}</span></Field>
        <Field label="White"><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{shortId(props.whiteUserId)}</span></Field>
        <Field label="Result"><span>{props.result ?? "in progress"}</span></Field>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a className="gs-btn" href={sgfUrl(props.gameId)} download style={{ textDecoration: "none" }}>
          Download SGF
        </a>
        <button
          type="button"
          className="gs-btn"
          onClick={() => {
            navigator.clipboard.writeText(window.location.href).catch(() => {});
            toast.push({ kind: "info", title: "Link copied", body: "Share this URL to point others at this game." });
          }}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>{children}</span>
    </div>
  );
}

function shortId(id: string | null): string {
  if (!id) return "—";
  if (id === AI_USER_ID) return "sensei-ai";
  return id.slice(0, 8) + "…";
}
