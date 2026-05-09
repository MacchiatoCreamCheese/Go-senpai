import { useEffect, useMemo, useRef, useState } from "react";

import { createGame, fetchGame, getPlayerNotes, playMove, requestAiMove, sgfUrl, swapColors, undoMove } from "./api";
import { GoBoard } from "./GoBoard";
import { LiveTierDot } from "./components/LiveTierDot";
import { ChatDrawer } from "./components/ChatDrawer";
import { PlayerNoteInput } from "./components/PlayerNoteInput";
import { connectGameSocket } from "./ws";
import type { ColorCode, GameT, GameStateT, MoveKind, PointT } from "./types";
import type { GhostStone } from "./GoBoard";

const USER_ID_KEY = "senpai_user_id";
const COLS = "ABCDEFGHJKLMNOPQRST";

interface Props {
  gameId: string;
  onExit: () => void;
  onPlayAgain?: (newGameId: string) => void;
  onOpenReview?: (gameId: string) => void;
}

function deriveRole(game: GameT | null, userId: string | null): ColorCode | null {
  if (!game || !userId) return null;
  if (game.black_user_id === userId) return "B";
  if (game.white_user_id === userId) return "W";
  return null;
}

export function GameView({ gameId, onExit, onPlayAgain, onOpenReview }: Props) {
  const [game, setGame] = useState<GameT | null>(null);
  const [state, setState] = useState<GameStateT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [playAgainPending, setPlayAgainPending] = useState(false);
  const [liveTiers, setLiveTiers] = useState<Map<number, "green" | "yellow" | "red">>(new Map());
  const [chatOpen, setChatOpen] = useState(false);
  const [senseiThinking, setSenseiThinking] = useState(false);
  const [playerNotes, setPlayerNotes] = useState<Record<number, string>>({});
  const [ownershipRaw, setOwnershipRaw] = useState<{ data: number[]; boardSize: number } | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setOverlayDismissed(false); }, [gameId]);

  useEffect(() => {
    const uid = localStorage.getItem(USER_ID_KEY);
    if (uid) getPlayerNotes(gameId, uid).then(setPlayerNotes);
  }, [gameId]);

  const role = deriveRole(game, localStorage.getItem(USER_ID_KEY));

  const ownershipGhosts = useMemo((): (GhostStone | null)[][] | undefined => {
    if (!ownershipRaw) return undefined;
    const { data, boardSize } = ownershipRaw;
    return Array.from({ length: boardSize }, (_, row) =>
      Array.from({ length: boardSize }, (_, col) => {
        const v = data[row * boardSize + col];
        if (v > 0.5)  return { sign:  1 as const, type: "good" as const, faint: true };
        if (v < -0.5) return { sign: -1 as const, type: "good" as const, faint: true };
        return null;
      }),
    );
  }, [ownershipRaw]);

  useEffect(() => {
    let cancelled = false;
    fetchGame(gameId)
      .then((g) => {
        if (cancelled) return;
        setGame(g);
        setState(g.state);
      })
      .catch((e) => setError(String(e)));
    return () => { cancelled = true; };
  }, [gameId]);

  useEffect(() => {
    if (!game || !state || aiThinking) return;
    if (game.opponent_type !== "ai") return;
    if (state.status !== "active") return;
    if (!role || state.turn === role) return;
    setAiThinking(true);
    requestAiMove(gameId)
      .then((s) => setState(s))
      .catch((e) => setError(`AI move failed: ${e}`))
      .finally(() => setAiThinking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.opponent_type, state?.turn, state?.status, role, gameId]);

  useEffect(() => {
    setLiveTiers(new Map());
    const close = connectGameSocket(
      gameId,
      (s) => setState(s),
      (players) =>
        setGame((prev) =>
          prev ? { ...prev, black_user_id: players.black_user_id, white_user_id: players.white_user_id } : prev,
        ),
      (e) => setLiveTiers((prev) => new Map(prev).set(e.move_number, e.tier)),
    );
    return close;
  }, [gameId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "c" || e.key === "C") setChatOpen((prev) => !prev);
      if (e.key === "Escape") setChatOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function copyId() {
    navigator.clipboard.writeText(gameId).catch(() => {});
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1800);
  }

  async function send(kind: MoveKind, point: PointT | null) {
    if (!role) { setError("You're not seated in this game yet."); return; }
    setError(null);
    try {
      const next = await playMove(gameId, role, kind, point);
      setState(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onSwap() {
    setError(null);
    setSwapping(true);
    try {
      const g = await swapColors(gameId);
      setGame(g);
      setState(g.state);
    } catch (e) {
      setError(String(e));
    } finally {
      setSwapping(false);
    }
  }

  async function handleUndo() {
    setError(null);
    try {
      const newState = await undoMove(gameId);
      setState(newState);
      const undonePlayer = newState.moves.length + 1;
      const undoneAi = newState.moves.length + 2;
      setLiveTiers((prev) => {
        const next = new Map(prev);
        next.delete(undonePlayer);
        next.delete(undoneAi);
        return next;
      });
    } catch (e) {
      setError(String(e));
    }
  }

  if (error && !state) {
    return (
      <div style={styles.errorPage}>
        <p style={{ color: "var(--seal)", marginBottom: 16 }}>Error: {error}</p>
        <button className="btn btn-ghost" onClick={onExit}>← Back to lobby</button>
      </div>
    );
  }

  if (!game || !state) {
    return (
      <div style={styles.loadingPage}>
        <span style={styles.loadingText}>Loading…</span>
      </div>
    );
  }

  async function handlePlayAgain() {
    if (!game || !role) return;
    if (game.opponent_type !== "ai") return;
    const userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) return;
    setPlayAgainPending(true);
    try {
      const next = await createGame(game.size as 9 | 13 | 19, userId, role, {
        opponentType: "ai",
        aiRank: game.ai_rank ?? 10,
      });
      onPlayAgain ? onPlayAgain(next.id) : (window.location.href = `/play/${next.id}`);
    } catch (e) {
      setError(`Couldn't start a new game: ${e}`);
    } finally {
      setPlayAgainPending(false);
    }
  }

  const disabled = !role || state.status !== "active" || state.turn !== role;
  const isMyTurn = !!role && state.status === "active" && state.turn === role;
  const isAiGame = game?.opponent_type === "ai";
  const canUndo = isAiGame && isMyTurn && state.moves.length >= 2;
  const preGame = state.moves.length === 0 && state.status === "active";
  const userId = localStorage.getItem(USER_ID_KEY) ?? "";

  return (
    <>
      <div className="play-studio">

        {/* ── LEFT: player cards + Miku slot + game info ── */}
        <div className="studio-left">
          <StudioPlayerCard color="W" game={game} state={state} role={role} aiThinking={aiThinking} />
          <StudioPlayerCard color="B" game={game} state={state} role={role} aiThinking={aiThinking} />
          <MikuSlot />
          <StudioGameInfo game={game} gameId={gameId} copied={copied} onCopy={copyId} />
        </div>

        {/* ── CENTER: training sticker + board + tier legend ── */}
        <div className="studio-center">
          {game?.training_mode && isAiGame && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 1 }}>
              <span className="gs-sticker" style={{ background: "var(--pastel-cyan)" }}>
                ⊙  TRAINING MODE · live coaching tier dots
              </span>
            </div>
          )}

          <div
            className="ai-thinking-shell gs-card"
            style={{ padding: 14, background: "var(--bg-2)", boxShadow: "var(--shadow-block)", marginTop: game?.training_mode && isAiGame ? 32 : 0 }}
          >
            <GoBoard
              state={state}
              disabled={disabled}
              onPlay={(p) => send("play", p)}
              ownershipGhosts={ownershipGhosts}
            />
            {aiThinking && (
              <div className="ai-thinking-overlay" aria-hidden="true">
                <div className="ai-thinking-pill">
                  <span className="ai-thinking-mark">先</span>
                  Sensei is thinking
                  <span className="ai-thinking-dots"><span /><span /><span /></span>
                </div>
              </div>
            )}
          </div>

          {game?.training_mode && isAiGame && (
            <div style={{ position: "absolute", bottom: 10, display: "flex", gap: 10 }}>
              <TierPill tier="good" label="ideal" />
              <TierPill tier="ok" label="ok" />
              <TierPill tier="bad" label="lost ≥ 2pt" />
            </div>
          )}
        </div>

        {/* ── RIGHT: sensei + notes + moves + actions ── */}
        <div className="studio-right">
          {isAiGame && state.status === "active" && (
            <AskSenseiPanel
              onOpen={() => setChatOpen(true)}
              chatOpen={chatOpen}
              senseiThinking={senseiThinking}
            />
          )}

          {isAiGame && role && state.status === "active" && (
            <StrategySection
              gameId={gameId}
              state={state}
              playerNotes={playerNotes}
              onSaved={(mn, body) => setPlayerNotes((prev) => ({ ...prev, [mn]: body }))}
              userId={userId}
            />
          )}

          <StudioMoveList
            moves={state.moves}
            boardSize={game.size}
            liveTiers={liveTiers}
            gameId={gameId}
            userId={userId}
            game={game}
            role={role}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {state.status === "active" ? (
              <div className="studio-action-row">
                <button className="gs-btn" onClick={handleUndo} disabled={!canUndo} style={{ padding: "8px 0", fontSize: 12 }}>↶ undo</button>
                <button className="gs-btn" onClick={() => send("pass", null)} disabled={!isMyTurn} style={{ padding: "8px 0", fontSize: 12 }}>pass</button>
                <button className="gs-btn gs-btn--red" onClick={() => send("resign", null)} disabled={!isMyTurn} style={{ padding: "8px 0", fontSize: 12 }}>resign</button>
                {preGame && role && (
                  <button className="gs-btn" onClick={onSwap} disabled={swapping} style={{ padding: "8px 0", fontSize: 12 }}>
                    {swapping ? "swapping…" : "swap ⇄"}
                  </button>
                )}
              </div>
            ) : (
              <div className="result-banner">
                <strong>Game over</strong>
                <span>{state.result ?? state.status}</span>
                <a href={`/games/${gameId}`} className="result-banner-link">Open review →</a>
              </div>
            )}
            {error && <p className="error-text" style={{ marginTop: 4 }}>{error}</p>}
            <div style={styles.footerLinks}>
              <a href={sgfUrl(gameId)} download style={styles.textLink}>Export SGF</a>
              <button className="gs-btn" onClick={onExit} style={{ padding: "7px 14px", fontSize: 13 }}>← Lobby</button>
            </div>
          </div>
        </div>
      </div>

      {/* Outside 3-col grid */}
      <ChatDrawer
        gameId={gameId}
        userId={userId}
        open={chatOpen}
        onClose={() => { setChatOpen(false); setOwnershipRaw(null); }}
        onStreamingChange={setSenseiThinking}
        onOwnership={(data, boardSize) => setOwnershipRaw({ data, boardSize })}
      />

      {state.status !== "active" && !overlayDismissed && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(26,23,20,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }} role="dialog" aria-modal="true" onClick={() => setOverlayDismissed(true)}>
          <div className="gs-card" style={{
            padding: "32px 36px",
            background: "var(--pastel-green)",
            boxShadow: "var(--shadow-block)",
            maxWidth: 420, width: "100%",
            textAlign: "center",
            position: "relative",
          }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setOverlayDismissed(true)}
              aria-label="Dismiss"
              style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--ink-mute)", lineHeight: 1 }}
            >×</button>
            <div className="gs-tag" style={{ marginBottom: 12 }}>GAME OVER</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 40, lineHeight: 1, marginBottom: 10 }}>
              {state.result ?? state.status}
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
              {role
                ? `You played ${role === "B" ? "Black" : "White"}${game.opponent_type === "ai" ? ` against Sensei AI ${game.ai_rank ?? "?"}k.` : "."}`
                : "You watched as a spectator."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="gs-btn gs-btn--primary"
                onClick={() => (onOpenReview ? onOpenReview(gameId) : (window.location.href = `/games/${gameId}`))}
              >
                Review this game
              </button>
              <button type="button" className="gs-btn" onClick={onExit}>Back to lobby</button>
              {game.opponent_type === "ai" && role && (
                <button type="button" className="gs-btn gs-btn--cyan" onClick={handlePlayAgain} disabled={playAgainPending}>
                  {playAgainPending ? "Starting…" : "Play again"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Studio sub-components ──────────────────────────────────────────

function StudioPlayerCard({
  color,
  game,
  state,
  role,
  aiThinking,
}: {
  color: ColorCode;
  game: GameT;
  state: GameStateT;
  role: ColorCode | null;
  aiThinking: boolean;
}) {
  const isActive = state.turn === color && state.status === "active";
  const isThinking = aiThinking && game.opponent_type === "ai" && color !== role;
  const isMe = color === role;
  const userId = color === "B" ? game.black_user_id : game.white_user_id;
  const isAi = game.opponent_type === "ai" && !isMe;
  const displayName = isMe ? "You" : isAi ? `KataGo · ${game.ai_rank ?? "?"}k` : (userId ?? "—");
  const captures = state.captures[color];

  return (
    <div className={`studio-player-card${isActive ? " is-active" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 99,
          border: "2.5px solid var(--ink)",
          background: color === "B" ? "var(--ink)" : "var(--bg-2)",
          color: color === "B" ? "var(--bg-2)" : "var(--ink)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
          flexShrink: 0,
        }}>{color}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{displayName}</span>
            {isMe && <span className="gs-tag" style={{ background: "var(--pastel-pink)" }}>YOU</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
            captured · {captures}
          </div>
        </div>
      </div>
      <div style={{
        padding: "6px 10px",
        border: "2px solid var(--ink)", borderRadius: 10,
        background: isThinking ? "var(--pastel-cyan)" : "var(--bg)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 700 }}>—</span>
        {isThinking
          ? <span style={{ fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 600 }}>thinking…</span>
          : isActive
            ? <span style={{ fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 600 }}>your turn</span>
            : <span style={{ fontSize: 11, fontFamily: "var(--font-display)", color: "var(--ink-mute)" }}>waiting</span>
        }
      </div>
    </div>
  );
}

function MikuSlot() {
  return (
    <div className="studio-miku">
      <div style={{ position: "absolute", top: 8, left: 10, right: 10, display: "flex", justifyContent: "space-between", zIndex: 2 }}>
        <span className="gs-tag" style={{ background: "var(--bg-2)" }}>LIVE2D · 初音ミク</span>
        <span className="gs-pill" style={{ background: "var(--bg-2)", fontSize: 10, padding: "2px 8px" }}>
          <span style={{ width: 6, height: 6, background: "var(--tier-good)", borderRadius: 99, border: "1px solid var(--ink)", display: "inline-block" }} />
          {" "}idle
        </span>
      </div>
      <div style={{ display: "grid", placeItems: "center", minHeight: 200, paddingTop: 44 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>live2d · placeholder</span>
      </div>
    </div>
  );
}

function StudioGameInfo({
  game,
  gameId,
  copied,
  onCopy,
}: {
  game: GameT;
  gameId: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="gs-card" style={{ padding: "12px 14px", background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span className="gs-tag">GAME · #{gameId.slice(0, 6)}</span>
        <button
          onClick={onCopy}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontFamily: "var(--font-mono)", color: copied ? "var(--tier-good)" : "var(--ink-mute)", padding: "2px 6px" }}
          title="Copy game ID"
        >
          {copied ? "✓ copied" : "copy id"}
        </button>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        <InfoRow k="board" v={`${game.size} × ${game.size}`} />
        <InfoRow k="komi" v={String(game.komi)} />
        <InfoRow k="rules" v="Chinese" />
        <InfoRow k="vs" v={game.opponent_type === "ai" ? `Sensei AI · ${game.ai_rank ?? "?"}k` : "Human"} />
      </div>
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--ink-mute)", padding: "2px 0" }}>
      <span style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{k}</span>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 13 }}>{v}</span>
    </div>
  );
}

const askChipStyle = (color: string): React.CSSProperties => ({
  display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 8, alignItems: "center",
  padding: "8px 10px",
  border: "2px solid var(--ink)", borderRadius: 10,
  background: color, cursor: "pointer", textAlign: "left",
  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
  color: "var(--ink)", width: "100%",
});

function AskSenseiPanel({
  onOpen,
  chatOpen,
  senseiThinking,
}: {
  onOpen: () => void;
  chatOpen: boolean;
  senseiThinking: boolean;
}) {
  return (
    <div className="gs-card" style={{ padding: 12, background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>ASK SENSEI · 先生</span>
        <span className={`gs-pill ${chatOpen && senseiThinking ? "gs-pill--yellow" : "gs-pill--mint"}`} style={{ fontSize: 10 }}>
          {chatOpen && senseiThinking ? "thinking…" : "ready"}
        </span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <button style={askChipStyle("var(--pastel-pink)")} onClick={onOpen}>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: "var(--bg-2)", border: "1.5px solid var(--ink)", display: "grid", placeItems: "center", fontSize: 12 }}>?</span>
          What am I missing?
          <span style={{ fontSize: 13, opacity: 0.6 }}>→</span>
        </button>
        <button style={askChipStyle("var(--pastel-yellow)")} onClick={onOpen}>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: "var(--bg-2)", border: "1.5px solid var(--ink)", display: "grid", placeItems: "center", fontSize: 12 }}>◎</span>
          What's my plan?
          <span style={{ fontSize: 13, opacity: 0.6 }}>→</span>
        </button>
        <button style={askChipStyle("var(--pastel-green)")} onClick={onOpen}>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: "var(--bg-2)", border: "1.5px solid var(--ink)", display: "grid", placeItems: "center", fontSize: 12 }}>⚔</span>
          Help me read this fight
          <span style={{ fontSize: 13, opacity: 0.6 }}>→</span>
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginTop: 8 }}>
        <input
          placeholder="ask anything…"
          onKeyDown={(e) => e.key === "Enter" && onOpen()}
          style={{ border: "2px solid var(--ink)", borderRadius: 10, padding: "7px 10px", fontFamily: "var(--font-body)", fontSize: 12, background: "var(--bg)", outline: "none" }}
        />
        <button className="gs-btn gs-btn--primary" onClick={onOpen} style={{ padding: "6px 10px", fontSize: 11 }}>↵</button>
      </div>
    </div>
  );
}

function StrategySection({
  gameId,
  state,
  playerNotes,
  onSaved,
  userId,
}: {
  gameId: string;
  state: GameStateT;
  playerNotes: Record<number, string>;
  onSaved: (mn: number, body: string) => void;
  userId: string;
}) {
  const noteEntries = Object.entries(playerNotes).filter(([, v]) => v);
  return (
    <div className="gs-card" style={{ padding: 10, background: "var(--pastel-lavender)" }}>
      <span className="gs-tag" style={{ background: "var(--bg-2)" }}>STRATEGY · fed to AI</span>
      {noteEntries.length > 0 && (
        <div style={{ display: "grid", gap: 5, marginTop: 6 }}>
          {noteEntries.slice(-3).map(([mn, text]) => (
            <div key={mn} style={{
              display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, alignItems: "start",
              padding: "5px 8px", border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--bg-2)",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, padding: "1px 5px", border: "1px solid var(--ink)", borderRadius: 4, background: "var(--pastel-yellow)" }}>m{mn}</span>
              <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{text}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <PlayerNoteInput
          gameId={gameId}
          userId={userId}
          moveNumber={state.moves.length}
          existingNote={playerNotes[state.moves.length]}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}

function StudioMoveList({
  moves,
  boardSize,
  liveTiers,
  gameId,
  userId,
  game,
  role,
}: {
  moves: GameStateT["moves"];
  boardSize: number;
  liveTiers: Map<number, "green" | "yellow" | "red">;
  gameId: string;
  userId: string;
  game: GameT;
  role: ColorCode | null;
}) {
  const tierColor = (t: string | undefined) =>
    t === "green" ? "var(--tier-good)" : t === "yellow" ? "var(--tier-ok)" : t === "red" ? "var(--tier-bad)" : "transparent";

  return (
    <div className="gs-card" style={{ background: "var(--bg-2)", overflow: "hidden", display: "grid", gridTemplateRows: "auto auto 1fr" }}>
      <div style={{ padding: "8px 12px", borderBottom: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="gs-tag">MOVES · {moves.length}</span>
      </div>
      {game?.training_mode && role && (
        <div style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)" }}>
          <LiveTierDot
            gameId={gameId}
            userId={userId}
            tiers={liveTiers}
            pendingCount={moves.reduce((n, m, i) => m.color === role && !liveTiers.has(i + 1) ? n + 1 : n, 0)}
            onShowOnBoard={() => {}}
          />
        </div>
      )}
      <div className="studio-move-grid">
        {moves.map((move, i) => {
          const num = i + 1;
          const isLatest = num === moves.length;
          let label: string;
          if (move.kind === "pass") label = "pass";
          else if (move.kind === "resign") label = "resign";
          else if (move.point) label = COLS[move.point.col] + (boardSize - move.point.row);
          else label = "?";
          const tier = liveTiers.get(num);
          return (
            <div key={num} className={`studio-move-row${isLatest ? " is-latest" : ""}`}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", minWidth: 16 }}>{num}</span>
              <span style={{
                width: 12, height: 12, borderRadius: 99, flexShrink: 0,
                background: move.color === "B" ? "var(--ink)" : "var(--bg-2)",
                border: "1.5px solid var(--ink)",
              }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{label}</span>
              {tier && (
                <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: 99, background: tierColor(tier), border: "1px solid var(--ink)", flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TierPill({ tier, label }: { tier: "good" | "ok" | "bad"; label: string }) {
  const c = tier === "good" ? "var(--tier-good)" : tier === "ok" ? "var(--tier-ok)" : "var(--tier-bad)";
  return (
    <span className="gs-pill" style={{ background: "var(--bg-2)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 99, background: c, border: "1.5px solid var(--ink)", display: "inline-block" }} />
      {" "}{label}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  errorPage: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  loadingPage: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "1.1rem",
    color: "var(--ink-mute)",
    letterSpacing: "0.02em",
  },
  footerLinks: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  textLink: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 13,
    color: "var(--ink-mute)",
    textDecoration: "none",
  },
};
