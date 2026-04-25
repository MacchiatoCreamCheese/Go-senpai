import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchGame,
  generateReview,
  getGameAnalysis,
  getReview,
  sgfUrl,
  triggerAnalyze,
  type MoveFeature,
  type ReviewResponse,
} from "../api";
import { GoBoard } from "../GoBoard";
import { MoveScrubber } from "../components/MoveScrubber";
import { EngineOverlay } from "../components/EngineOverlay";
import { ScoreLineChart } from "../components/ScoreLineChart";
import { MomentCard } from "../components/MomentCard";
import { useToast } from "../components/NotificationToast";
import { boardAtMove, parseCoord } from "../lib/replay";
import { renderMarkdown } from "../lib/markdown";

const AI_USER_ID = "00000000-0000-0000-0000-0000000000a1";
const USER_ID_KEY = "senpai_user_id";

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

  const userId = typeof window !== "undefined" ? localStorage.getItem(USER_ID_KEY) : null;
  const review = useQuery({
    queryKey: ["review", gameId, userId],
    queryFn: () => (userId ? getReview(gameId, userId) : Promise.resolve(null)),
    enabled: !!gameId,
  });

  const [tab, setTab] = useState<TabId>("review");
  const [showTopMove, setShowTopMove] = useState(true);
  const [showOwnership, setShowOwnership] = useState(false); // disabled — no data yet
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

  return (
    <div className="viewer-root">
      <header className="viewer-header">
        <div>
          <Link to="/games" className="viewer-crumb">← Games</Link>
          <h1 className="viewer-title">Game review</h1>
        </div>
        <div className="viewer-meta">
          {game.data && (
            <>
              <span>{game.data.size}×{game.data.size}</span>
              <span className="viewer-meta-sep">·</span>
              <span>komi {game.data.komi}</span>
              <span className="viewer-meta-sep">·</span>
              <span>{game.data.opponent_type === "ai" ? `vs Sensei AI ${game.data.ai_rank ?? "?"}k` : "vs human"}</span>
              {game.data.state.result && (
                <>
                  <span className="viewer-meta-sep">·</span>
                  <span className="viewer-meta-result">{game.data.state.result}</span>
                </>
              )}
            </>
          )}
        </div>
      </header>

      <div className="viewer-body">
        {/* Board column */}
        <div className="viewer-board">
          {game.isLoading ? (
            <div className="viewer-board-skel">Loading game…</div>
          ) : game.error || !game.data || !replay ? (
            <div className="viewer-board-skel">Couldn't load game.</div>
          ) : (
            <>
              <div className="viewer-board-toolbar">
                <EngineOverlay
                  toggles={[
                    {
                      id: "top",
                      label: "Top engine move",
                      enabled: showTopMove,
                      available: !!analysis.data,
                      hint: "Run analysis first",
                    },
                    {
                      id: "own",
                      label: "Ownership map",
                      enabled: showOwnership,
                      available: false,
                      hint: "Backend doesn't store ownership data yet",
                    },
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
                disabled
                showCoordinates
              />

              <MoveScrubber
                current={currentMove}
                total={totalMoves}
                onChange={setMove}
              />

              <ScoreLineChart
                points={scorePoints}
                currentMove={currentMove}
                onScrub={setMove}
              />
            </>
          )}
        </div>

        {/* Right panel */}
        <aside className="viewer-panel">
          <nav className="viewer-tabs" role="tablist">
            <TabBtn id="review" label="Review" active={tab} onSelect={setTab} />
            <TabBtn id="analysis" label="Analysis" active={tab} onSelect={setTab} />
            <TabBtn id="info" label="Info" active={tab} onSelect={setTab} />
          </nav>

          {tab === "review" && (
            <ReviewTab
              gameId={gameId}
              userId={userId}
              loading={review.isLoading}
              review={review.data ?? null}
              gameFinished={!!game.data?.state.result}
              currentMove={currentMove}
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
        </aside>
      </div>
    </div>
  );
}

function TabBtn({
  id,
  label,
  active,
  onSelect,
}: {
  id: TabId;
  label: string;
  active: TabId;
  onSelect: (t: TabId) => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active === id}
      className={"viewer-tab" + (active === id ? " is-active" : "")}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}

interface ReviewTabProps {
  gameId: string;
  userId: string | null;
  loading: boolean;
  review: ReviewResponse | null;
  gameFinished: boolean;
  currentMove: number;
  onShowOnBoard: (moveNumber: number) => void;
}

function ReviewTab({
  gameId,
  userId,
  loading,
  review,
  gameFinished,
  currentMove,
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

  if (loading) return <div className="viewer-panel-empty">Loading review…</div>;

  if (!userId) {
    return (
      <div className="viewer-review-empty">
        <div className="viewer-review-mark">評</div>
        <h2>Sign in first</h2>
        <p>Reviews are written for one player at a time. Set a name in the Lobby, then come back.</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="viewer-review-empty">
        <div className="viewer-review-mark">評</div>
        <h2>No review yet</h2>
        <p>
          {gameFinished
            ? "Generate a review for your perspective. KataGo features need to exist first — run analysis from the Analysis tab if you haven't."
            : "Reviews are generated once a game has finished."}
        </p>
        {gameFinished && (
          <button
            className="btn btn-primary"
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
      <header className="review-head">
        <div>
          <div className="review-head-eyebrow">Reviewed for you</div>
          <div className="review-head-meta">
            <span className="mono dim">{review.model}</span>
            <span className="viewer-meta-sep">·</span>
            <span>{generatedLabel}</span>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => generate.mutate({ force: true })}
          disabled={generate.isPending}
          title="Regenerate from scratch"
        >
          {generate.isPending ? "Regenerating…" : "Regenerate"}
        </button>
      </header>

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
}: AnalysisTabProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: () => triggerAnalyze(gameId),
    onSuccess: (res) => {
      toast.push({
        kind: "success",
        title: res.cached ? "Analysis already cached" : "Analysis complete",
        body: `${res.move_count} moves · ${res.katago_version}`,
      });
      queryClient.invalidateQueries({ queryKey: ["analysis", gameId] });
    },
    onError: (err) => {
      toast.push({ kind: "error", title: "Analysis failed", body: String(err) });
    },
  });

  if (loading) return <div className="viewer-panel-empty">Loading analysis…</div>;

  if (!features) {
    return (
      <div className="viewer-review-empty">
        <div className="viewer-review-mark">析</div>
        <h2>No analysis yet</h2>
        <p>
          {gameFinished
            ? "Run KataGo over this game to see per-move points lost, top moves, and the score curve."
            : "Analysis is available once the game has finished."}
        </p>
        {gameFinished && (
          <button
            className="btn btn-primary"
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
    <div className="analysis-tab">
      <div className="analysis-controls">
        <label className="checkbox">
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
        >
          <option value="move">By move</option>
          <option value="lost">By points lost</option>
        </select>
      </div>

      <div className="analysis-table-wrap">
        <table className="analysis-table">
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
              return (
                <tr
                  key={f.move_number}
                  className={
                    (f.is_blunder ? "is-blunder " : "") +
                    (isCurrent ? "is-current" : "")
                  }
                  onClick={() => onSelect(f.move_number)}
                >
                  <td className="mono">{f.move_number}</td>
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

      <div className="analysis-foot">
        <span>{sorted.length} moves shown</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          title="Re-run KataGo over this game"
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
    <div className="info-tab">
      <Field label="Game ID">
        <span className="tag">{props.gameId}</span>
      </Field>
      <Field label="Board"><span>{props.size}×{props.size}</span></Field>
      <Field label="Komi"><span>{props.komi}</span></Field>
      <Field label="Opponent">
        <span>
          {props.opponentType === "ai" ? `Sensei AI · ${props.aiRank ?? "?"}k` : "Human"}
        </span>
      </Field>
      <Field label="Black"><span className="mono dim">{shortId(props.blackUserId)}</span></Field>
      <Field label="White"><span className="mono dim">{shortId(props.whiteUserId)}</span></Field>
      <Field label="Result"><span>{props.result ?? "in progress"}</span></Field>

      <hr className="divider" />

      <div className="info-actions">
        <a className="btn btn-ghost" href={sgfUrl(props.gameId)} download>
          Download SGF
        </a>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            navigator.clipboard.writeText(window.location.href).catch(() => {});
            toast.push({ kind: "info", title: "Link copied", body: "Share this URL to point others at this game." });
          }}
        >
          Copy share link
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="info-field">
      <span className="info-field-label">{label}</span>
      <span className="info-field-value">{children}</span>
    </div>
  );
}

function shortId(id: string | null): string {
  if (!id) return "—";
  if (id === AI_USER_ID) return "sensei-ai";
  return id.slice(0, 8) + "…";
}
