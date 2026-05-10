import { useEffect, useMemo, useRef, useState } from "react";

import { createGame, fetchGame, fetchUser, getPlayerNotes, playMove, requestAiMove, sgfUrl, swapColors, undoMove } from "./api";
import type { UserT } from "./api";
import { GoBoard } from "./GoBoard";
import { LiveTierDot } from "./components/LiveTierDot";
import { ChatDrawer } from "./components/ChatDrawer";
import { PlayerNoteInput } from "./components/PlayerNoteInput";
import { MikuLive2D } from "./live2d/MikuLive2D";
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
  const [playerHandles, setPlayerHandles] = useState<Record<string, string>>({});
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setOverlayDismissed(false); }, [gameId]);

  useEffect(() => {
    const uid = localStorage.getItem(USER_ID_KEY);
    if (uid) getPlayerNotes(gameId, uid).then(setPlayerNotes);
  }, [gameId]);

  useEffect(() => {
    if (!game || game.opponent_type !== "human") return;
    const ids = [game.black_user_id, game.white_user_id].filter(Boolean) as string[];
    ids.forEach((id) => {
      fetchUser(id)
        .then((u: UserT) => setPlayerHandles((prev) => ({ ...prev, [id]: u.handle })))
        .catch(() => {});
    });
  }, [game?.black_user_id, game?.white_user_id, game?.opponent_type]);

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

  const opponentColor: ColorCode = role === "B" ? "W" : "B";
  const myColor: ColorCode = role ?? "B";

  return (
    <>
      <div className="play-sandwich">

        {/* ── LEFT: Miku + game info ── */}
        <div className="sandwich-left">
          <MikuSlot />
          <StudioGameInfo game={game} gameId={gameId} copied={copied} onCopy={copyId} />
        </div>

        {/* ── CENTER: opponent → board → you (sandwich) ── */}
        <div className="sandwich-center">
          {/* Opponent card on top */}
          <SandwichPlayerCard
            color={role ? opponentColor : "W"}
            game={game}
            state={state}
            role={role}
            aiThinking={aiThinking}
            playerHandles={playerHandles}
          />

          {/* Board */}
          <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
            {game?.training_mode && isAiGame && (
              <div style={{ position: "absolute", top: -6, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 1 }}>
                <span className="gs-sticker" style={{ background: "var(--pastel-cyan)" }}>
                  ⊙  TRAINING MODE · live coaching tier dots
                </span>
              </div>
            )}
            <div
              className="ai-thinking-shell gs-card"
              style={{ padding: 14, background: "var(--bg-2)", boxShadow: "var(--shadow-block)", marginTop: game?.training_mode && isAiGame ? 26 : 0 }}
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
              <div style={{ position: "absolute", bottom: -28, display: "flex", gap: 10 }}>
                <TierPill tier="good" label="ideal" />
                <TierPill tier="ok" label="ok" />
                <TierPill tier="bad" label="lost ≥ 2pt" />
              </div>
            )}
          </div>

          {/* Your card on bottom */}
          <SandwichPlayerCard
            color={role ? myColor : "B"}
            game={game}
            state={state}
            role={role}
            aiThinking={aiThinking}
            playerHandles={playerHandles}
            isYou
          />
        </div>

        {/* ── RIGHT: tabbed dock (moves · notes · sensei) ── */}
        <div className="sandwich-right">
          <PlaySidePanel
            game={game}
            gameId={gameId}
            state={state}
            role={role}
            userId={userId}
            isAiGame={isAiGame}
            playerNotes={playerNotes}
            onNoteSaved={(mn, body) => setPlayerNotes((prev) => ({ ...prev, [mn]: body }))}
            liveTiers={liveTiers}
            chatOpen={chatOpen}
            senseiThinking={senseiThinking}
            onOpenChat={() => setChatOpen(true)}
            canUndo={canUndo}
            isMyTurn={isMyTurn}
            preGame={preGame}
            swapping={swapping}
            onSwap={onSwap}
            onUndo={handleUndo}
            onPass={() => send("pass", null)}
            onResign={() => send("resign", null)}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            {error && <p className="error-text">{error}</p>}
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

function SandwichPlayerCard({
  color,
  game,
  state,
  role,
  aiThinking,
  playerHandles,
  isYou = false,
}: {
  color: ColorCode;
  game: GameT;
  state: GameStateT;
  role: ColorCode | null;
  aiThinking: boolean;
  playerHandles: Record<string, string>;
  isYou?: boolean;
}) {
  const isActive = state.turn === color && state.status === "active";
  const isThinking = aiThinking && game.opponent_type === "ai" && color !== role;
  const isMe = color === role;
  const uid = color === "B" ? game.black_user_id : game.white_user_id;
  const isAi = game.opponent_type === "ai" && !isMe;
  const displayName = isMe
    ? "You"
    : isAi
      ? `KataGo · ${game.ai_rank ?? "?"}k`
      : (uid ? (playerHandles[uid] ?? uid) : "—");
  const captures = state.captures[color];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12,
      padding: "8px 12px",
      background: isActive ? "var(--pastel-yellow)" : "var(--bg-2)",
      border: isActive ? "2.5px solid var(--ink)" : "2.5px solid var(--border)",
      borderRadius: 14,
      width: "100%", boxSizing: "border-box",
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        border: "2.5px solid var(--ink)",
        background: color === "B" ? "var(--ink)" : "var(--bg-2)",
        color: color === "B" ? "var(--bg-2)" : "var(--ink)",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
        flexShrink: 0,
      }}>{color}</div>
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{displayName}</span>
          {isYou && isMe && <span className="gs-tag" style={{ background: "var(--pastel-pink)" }}>YOU</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
          {isThinking ? "thinking…" : isActive ? "your move" : "waiting"} · captures {captures}
        </div>
      </div>
      <div style={{
        padding: "6px 12px", border: "2.5px solid var(--ink)", borderRadius: 12,
        background: isThinking ? "var(--pastel-cyan)" : isActive ? "var(--bg)" : "var(--bg)",
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 20,
        minWidth: 60, textAlign: "center",
      }}>—</div>
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
      <div className="studio-miku-body">
        <MikuLive2D />
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
  embedded,
}: {
  onOpen: () => void;
  chatOpen: boolean;
  senseiThinking: boolean;
  embedded?: boolean;
}) {
  const inner = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>ASK SENSEI · 先生</span>
        <span className={`gs-pill ${chatOpen && senseiThinking ? "gs-pill--yellow" : "gs-pill--mint"}`} style={{ fontSize: 10 }}>
          {chatOpen && senseiThinking ? "thinking…" : "ready"}
        </span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <button type="button" style={askChipStyle("var(--pastel-pink)")} onClick={onOpen}>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: "var(--bg-2)", border: "1.5px solid var(--ink)", display: "grid", placeItems: "center", fontSize: 12 }}>?</span>
          What am I missing?
          <span style={{ fontSize: 13, opacity: 0.6 }}>→</span>
        </button>
        <button type="button" style={askChipStyle("var(--pastel-yellow)")} onClick={onOpen}>
          <span style={{ width: 22, height: 22, borderRadius: 99, background: "var(--bg-2)", border: "1.5px solid var(--ink)", display: "grid", placeItems: "center", fontSize: 12 }}>◎</span>
          What&apos;s my plan?
          <span style={{ fontSize: 13, opacity: 0.6 }}>→</span>
        </button>
        <button type="button" style={askChipStyle("var(--pastel-green)")} onClick={onOpen}>
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
        <button type="button" className="gs-btn gs-btn--primary" onClick={onOpen} style={{ padding: "6px 10px", fontSize: 11 }}>↵</button>
      </div>
    </>
  );

  if (embedded) return <div style={{ padding: "10px 12px" }}>{inner}</div>;

  return (
    <div className="gs-card" style={{ padding: 12, background: "var(--bg-2)" }}>
      {inner}
    </div>
  );
}

function StrategySection({
  gameId,
  state,
  playerNotes,
  onSaved,
  userId,
  embedded,
}: {
  gameId: string;
  state: GameStateT;
  playerNotes: Record<number, string>;
  onSaved: (mn: number, body: string) => void;
  userId: string;
  embedded?: boolean;
}) {
  const noteEntries = Object.entries(playerNotes).filter(([, v]) => v);
  const inner = (
    <>
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
    </>
  );

  if (embedded) {
    return (
      <div style={{ padding: "10px 12px", background: "var(--pastel-lavender)", minHeight: "100%", boxSizing: "border-box" }}>
        {inner}
      </div>
    );
  }

  return (
    <div className="gs-card" style={{ padding: 10, background: "var(--pastel-lavender)" }}>
      {inner}
    </div>
  );
}

function moveDisplayLabel(move: GameStateT["moves"][number], boardSize: number): string {
  if (move.kind === "pass") return "pass";
  if (move.kind === "resign") return "resign";
  if (move.point) return COLS[move.point.col] + (boardSize - move.point.row);
  return "?";
}

type SideTabId = "moves" | "notes" | "sensei";

function PlaySidePanel({
  game,
  gameId,
  state,
  role,
  userId,
  isAiGame,
  playerNotes,
  onNoteSaved,
  liveTiers,
  chatOpen,
  senseiThinking,
  onOpenChat,
  canUndo,
  isMyTurn,
  preGame,
  swapping,
  onSwap,
  onUndo,
  onPass,
  onResign,
}: {
  game: GameT;
  gameId: string;
  state: GameStateT;
  role: ColorCode | null;
  userId: string;
  isAiGame: boolean;
  playerNotes: Record<number, string>;
  onNoteSaved: (mn: number, body: string) => void;
  liveTiers: Map<number, "green" | "yellow" | "red">;
  chatOpen: boolean;
  senseiThinking: boolean;
  onOpenChat: () => void;
  canUndo: boolean;
  isMyTurn: boolean;
  preGame: boolean;
  swapping: boolean;
  onSwap: () => void;
  onUndo: () => void;
  onPass: () => void;
  onResign: () => void;
}) {
  const [tab, setTab] = useState<SideTabId>("moves");

  const noteCount = useMemo(
    () => Object.values(playerNotes).filter((v) => typeof v === "string" && v.trim().length > 0).length,
    [playerNotes],
  );

  const showNotesTooling = isAiGame && !!role && state.status === "active";
  const showSenseiTooling = isAiGame && state.status === "active";

  const tabs: { id: SideTabId; label: string }[] = [
    { id: "moves", label: `Moves · ${state.moves.length}` },
    { id: "notes", label: `Notes · ${noteCount}` },
    { id: "sensei", label: "Sensei" },
  ];

  return (
    <div className="play-side-dock gs-card" style={{ background: "var(--bg-2)" }}>
      <div className="play-side-tabs" role="tablist" aria-label="Game panel">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`play-tab-${t.id}`}
            aria-controls={`play-tabpanel-${t.id}`}
            aria-selected={tab === t.id}
            tabIndex={tab === t.id ? 0 : -1}
            className="play-side-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="play-side-meta">
        <span className="gs-tag">{game.size}×{game.size}</span>
        <span className="gs-tag">komi {game.komi}</span>
        <span className="gs-tag">CHN</span>
        <span className="play-side-meta__id">game #{gameId.slice(0, 8)}</span>
      </div>

      <div className="play-side-body">
        {tab === "moves" && (
          <div
            className="play-side-panel-fill"
            role="tabpanel"
            id="play-tabpanel-moves"
            aria-labelledby="play-tab-moves"
          >
            {game.training_mode && role && (
              <div className="play-side-panel-moves__training">
                <LiveTierDot
                  gameId={gameId}
                  userId={userId}
                  tiers={liveTiers}
                  pendingCount={state.moves.reduce((n, m, i) => m.color === role && !liveTiers.has(i + 1) ? n + 1 : n, 0)}
                  onShowOnBoard={() => {}}
                />
              </div>
            )}
            <MoveListBody moves={state.moves} boardSize={game.size} liveTiers={liveTiers} />
          </div>
        )}

        {tab === "notes" && (
          <div
            className="play-side-pane-scroll"
            role="tabpanel"
            id="play-tabpanel-notes"
            aria-labelledby="play-tab-notes"
          >
            {showNotesTooling ? (
              <StrategySection
                embedded
                gameId={gameId}
                state={state}
                playerNotes={playerNotes}
                onSaved={onNoteSaved}
                userId={userId}
              />
            ) : (
              <p className="play-side-placeholder">
                Strategy notes and AI-fed context are available when you&apos;re seated in an active AI game.
              </p>
            )}
          </div>
        )}

        {tab === "sensei" && (
          <div
            className="play-side-pane-scroll"
            role="tabpanel"
            id="play-tabpanel-sensei"
            aria-labelledby="play-tab-sensei"
          >
            {showSenseiTooling ? (
              <AskSenseiPanel
                embedded
                onOpen={onOpenChat}
                chatOpen={chatOpen}
                senseiThinking={senseiThinking}
              />
            ) : (
              <p className="play-side-placeholder">
                Live Sensei coaching appears here during AI games. A shared chat lane for humans can tie into this tab later.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="play-side-actions play-side-actions--row3">
        {state.status === "active" ? (
          <>
            <button type="button" className="gs-btn" onClick={onUndo} disabled={!canUndo} style={{ padding: "8px 0", fontSize: 12 }}>↶</button>
            <button type="button" className="gs-btn" onClick={onPass} disabled={!isMyTurn} style={{ padding: "8px 0", fontSize: 12 }}>pass</button>
            <button type="button" className="gs-btn gs-btn--red" onClick={onResign} disabled={!isMyTurn} style={{ padding: "8px 0", fontSize: 12 }}>resign</button>
            {preGame && role && (
              <button type="button" className="gs-btn play-side-actions__swap" onClick={onSwap} disabled={swapping} style={{ padding: "8px 0", fontSize: 12 }}>
                {swapping ? "swapping…" : "swap colors ⇄"}
              </button>
            )}
          </>
        ) : (
          <div className="result-banner" style={{ gridColumn: "1 / -1" }}>
            <strong>Game over</strong>
            <span>{state.result ?? state.status}</span>
            <a href={`/games/${gameId}`} className="result-banner-link">Open review →</a>
          </div>
        )}
      </div>
    </div>
  );
}

function MoveListBody({
  moves,
  boardSize,
  liveTiers,
}: {
  moves: GameStateT["moves"];
  boardSize: number;
  liveTiers: Map<number, "green" | "yellow" | "red">;
}) {
  const tierColor = (t: string | undefined) =>
    t === "green" ? "var(--tier-good)" : t === "yellow" ? "var(--tier-ok)" : t === "red" ? "var(--tier-bad)" : "transparent";

  const pairCount = Math.ceil(moves.length / 2);
  const lastIdx = moves.length - 1;

  return (
    <div className={`sandwich-move-list${pairCount === 0 ? " sandwich-move-list--empty" : ""}`}>
      {pairCount === 0 ? (
        <div style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>No moves yet</div>
      ) : (
        Array.from({ length: pairCount }, (_, row) => {
          const bi = row * 2;
          const wi = row * 2 + 1;
          const blackMove = moves[bi];
          const whiteMove = moves[wi];
          const moveNo = row + 1;
          const isLatestBlack = blackMove !== undefined && bi === lastIdx;
          const isLatestWhite = whiteMove !== undefined && wi === lastIdx;
          const tierB = liveTiers.get(bi + 1);
          const tierW = whiteMove !== undefined ? liveTiers.get(wi + 1) : undefined;

          let cellBClass = "sandwich-move-cell";
          if (isLatestBlack) cellBClass += " sandwich-move-cell--latest-b";

          let cellWClass = "sandwich-move-cell";
          if (!whiteMove) cellWClass += " sandwich-move-cell--muted";
          else if (isLatestWhite) cellWClass += " sandwich-move-cell--latest-w";

          return (
            <div key={moveNo} className="sandwich-move-row">
              <span className="sandwich-move-num">{moveNo}.</span>
              <span className={cellBClass}>
                {moveDisplayLabel(blackMove, boardSize)}
                {tierB && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 99,
                      background: tierColor(tierB),
                      border: "1px solid var(--ink)",
                      flexShrink: 0,
                    }}
                    aria-hidden
                  />
                )}
              </span>
              <span className={cellWClass}>
                {!whiteMove ? "—" : moveDisplayLabel(whiteMove, boardSize)}
                {whiteMove && tierW && (
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 99,
                      background: tierColor(tierW),
                      border: "1px solid var(--ink)",
                      flexShrink: 0,
                    }}
                    aria-hidden
                  />
                )}
              </span>
            </div>
          );
        })
      )}
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
