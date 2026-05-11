import { useEffect, useMemo, useRef, useState } from "react";

import { createGame, fetchGame, fetchUser, getPlayerNotes, playMove, requestAiMove, sgfUrl, swapColors, undoMove } from "./api";
import type { UserT } from "./api";
import { COACH_PRESET_MODES } from "./constants/coachModes";
import { GoBoard } from "./GoBoard";
import { useChatStream } from "./hooks/useChatStream";
import { PlayerNoteInput } from "./components/PlayerNoteInput";
import { MikuLive2D } from "./live2d/MikuLive2D";
import { connectGameSocket } from "./ws";
import type { ChatMessage } from "./ws";
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
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [playAgainPending, setPlayAgainPending] = useState(false);
  const [playerNotes, setPlayerNotes] = useState<Record<number, string>>({});
  const [ownershipRaw, setOwnershipRaw] = useState<{ data: number[]; boardSize: number } | null>(null);
  const [playerHandles, setPlayerHandles] = useState<Record<string, string>>({});
  const [humanChatMessages, setHumanChatMessages] = useState<ChatMessage[]>([]);
  const [senseiStreaming, setSenseiStreaming] = useState(false);
  const sendChatRef = useRef<((userId: string, message: string) => void) | null>(null);
  const boardSlotRef = useRef<HTMLDivElement>(null);
  const [boardSlotSize, setBoardSlotSize] = useState({ w: 0, h: 0 });
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setOverlayDismissed(false); }, [gameId]);

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
  }, [game?.id, state?.status]);

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
    setHumanChatMessages([]);
    const { disconnect, sendChat } = connectGameSocket(
      gameId,
      (s) => setState(s),
      (players) =>
        setGame((prev) =>
          prev ? { ...prev, black_user_id: players.black_user_id, white_user_id: players.white_user_id } : prev,
        ),
      () => {},
      (msg) => setHumanChatMessages((prev) => [...prev, msg]),
    );
    sendChatRef.current = sendChat;
    return disconnect;
  }, [gameId]);


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
      setErrorDialog(String(e));
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
    } catch (e) {
      setError(String(e));
    }
  }

  /** Square goban side from board slot size (must run before early returns — Rules of Hooks). */
  const boardWidth = useMemo(() => {
    const MIN = 200;
    const padX = 24;
    const train = Boolean(game?.training_mode && game?.opponent_type === "ai");
    const reserveY = train ? 88 : 20;
    const { w: sw, h: sh } = boardSlotSize;
    if (sw <= 0 || sh <= 0) return 520;
    const aw = Math.max(0, sw - padX);
    const ah = Math.max(0, sh - reserveY);
    const side = Math.floor(Math.min(aw, ah));
    return Math.max(MIN, side);
  }, [boardSlotSize, game?.training_mode, game?.opponent_type]);

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
      <div className="game-view-root">
      <div className="play-sandwich">

        {/* ── LEFT: opponent → Miku → you */}
        <div className="sandwich-left">
          <div className="sandwich-left-player-top">
            <SandwichPlayerCard
              color={role ? opponentColor : "W"}
              game={game}
              state={state}
              role={role}
              aiThinking={aiThinking}
              playerHandles={playerHandles}
            />
          </div>
          <MikuSlot speaking={senseiStreaming} />
          <div className="sandwich-left-player-bottom">
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
        </div>

        {/* ── CENTER: board (player cards duplicated here on narrow viewports — see sandwich-mobile-player) ── */}
        <div className="sandwich-center">
          <div className="sandwich-mobile-player sandwich-mobile-player--top">
            <SandwichPlayerCard
              color={role ? opponentColor : "W"}
              game={game}
              state={state}
              role={role}
              aiThinking={aiThinking}
              playerHandles={playerHandles}
            />
          </div>

          <div className="sandwich-board-slot" ref={boardSlotRef}>
          {/* Board */}
          <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
            {game?.training_mode && isAiGame && (
              <div style={{ position: "absolute", top: -6, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 1 }}>
                <span className="gs-sticker" style={{ background: "var(--pastel-cyan)" }}>
                  ⊙  TRAINING MODE
                </span>
              </div>
            )}
            <div
              style={{
                position: "relative",
                display: "inline-block",
                marginTop: game?.training_mode && isAiGame ? 26 : 0,
              }}
            >
              <GoBoard
                state={state}
                disabled={disabled}
                onPlay={(p) => send("play", p)}
                ownershipGhosts={ownershipGhosts}
                width={boardWidth}
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
          </div>
          </div>

          <div className="sandwich-mobile-player sandwich-mobile-player--bottom">
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
            onSenseiStreamingChange={setSenseiStreaming}
            onSenseiOwnership={(data, boardSize) => setOwnershipRaw({ data, boardSize })}
            canUndo={canUndo}
            isMyTurn={isMyTurn}
            preGame={preGame}
            swapping={swapping}
            onSwap={onSwap}
            onUndo={handleUndo}
            onPass={() => send("pass", null)}
            onResign={() => send("resign", null)}
            gameIdCopied={copied}
            onCopyGameId={copyId}
            humanChatMessages={humanChatMessages}
            onSendChat={(uid, msg) => sendChatRef.current?.(uid, msg)}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            <div style={styles.footerLinks}>
              <a href={sgfUrl(gameId)} download className="gs-btn gs-btn--sgf">
                ↓ SGF
              </a>
              <button className="gs-btn" onClick={onExit} style={{ padding: "7px 14px", fontSize: 13 }}>← Lobby</button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {errorDialog && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(26,23,20,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
          role="dialog"
          aria-modal="true"
          onClick={() => setErrorDialog(null)}
        >
          <div
            className="gs-card"
            style={{
              padding: "28px 32px",
              background: "var(--pastel-pink)",
              boxShadow: "var(--shadow-block)",
              maxWidth: 380, width: "100%",
              textAlign: "center",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setErrorDialog(null)}
              aria-label="Dismiss"
              style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--ink-mute)", lineHeight: 1 }}
            >×</button>
            <div className="gs-tag" style={{ marginBottom: 10 }}>ILLEGAL MOVE</div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
              That move is not allowed.
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 18 }}>
              {errorDialog.toLowerCase().includes("suicide")
                ? "Suicide moves are forbidden — a group must have at least one liberty after being placed."
                : errorDialog.toLowerCase().includes("ko")
                  ? "Ko rule: you cannot recreate the previous board position immediately."
                  : "Try a different intersection."}
            </p>
            <button type="button" className="gs-btn gs-btn--primary" onClick={() => setErrorDialog(null)}>
              Got it
            </button>
          </div>
        </div>
      )}

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
                onClick={() => (onOpenReview ? onOpenReview(gameId) : (window.location.href = `/games/${gameId}/review`))}
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
      display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 12,
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
    </div>
  );
}

function MikuSlot({ speaking = false }: { speaking?: boolean }) {
  return (
    <div className="studio-miku">
      <div style={{ position: "absolute", top: 8, left: 10, right: 10, display: "flex", justifyContent: "space-between", zIndex: 2 }}>
        <span className="gs-tag" style={{ background: "var(--bg-2)" }}>LIVE2D · 初音ミク</span>
        <span className="gs-pill" style={{ background: speaking ? "var(--pastel-cyan)" : "var(--bg-2)", fontSize: 10, padding: "2px 8px" }}>
          <span style={{ width: 6, height: 6, background: speaking ? "var(--pastel-cyan)" : "var(--tier-good)", borderRadius: 99, border: "1px solid var(--ink)", display: "inline-block" }} />
          {" "}{speaking ? "speaking" : "idle"}
        </span>
      </div>
      <div className="studio-miku-body">
        <MikuLive2D speaking={speaking} />
      </div>
    </div>
  );
}


function cleanSenseiText(text: string): string {
  const t = text
    .replace(/^[ \t]*(analysis|coach note|note):\s*/gim, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_\(([\s\S]*?)\)_/g, "($1)")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

const SENSEI_MODES = [...COACH_PRESET_MODES];

function PlaySenseiChat({
  stream,
  onStreamingChange,
  onOwnership,
}: {
  stream: ReturnType<typeof useChatStream>;
  onStreamingChange: (v: boolean) => void;
  onOwnership: (data: number[], boardSize: number) => void;
}) {
  const { messages, isStreaming, ownership, send } = stream;
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => { onStreamingChange(isStreaming); }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ownership) onOwnership(ownership.data, ownership.boardSize); }, [ownership]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    send("followup", text);
    setInput("");
  };

  return (
    <section className="viewer-rail-chat viewer-rail-chat--live-play gs-card gs-card--ink" style={{ flex: 1, minHeight: 0, margin: 0, borderRadius: 0, border: "none", borderTop: "2px solid var(--border)" }} aria-label="Ask Sensei">
      <div className="viewer-sensei-head">
        <span className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>ASK SENSEI · 先生</span>
        <span className={`gs-pill ${isStreaming ? "gs-pill--yellow" : "gs-pill--mint"}`} style={{ fontSize: 10 }}>
          {isStreaming ? "thinking…" : "ready"}
        </span>
      </div>

      {!hasMessages && (
        <div className="viewer-sensei-modes">
          {SENSEI_MODES.map((m) => (
            <button key={m.id} type="button" className="gs-btn"
              style={{ textAlign: "left", justifyContent: "flex-start" }}
              onClick={() => !isStreaming && send(m.id)} disabled={isStreaming}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {hasMessages && (
        <div className="viewer-sensei-thread" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`viewer-sensei-bubble viewer-sensei-bubble--${msg.role}${
                msg.strategyNoteMove != null ? " viewer-sensei-bubble--strategy-note" : ""
              }`}
            >
              {msg.streaming && !msg.text
                ? <span className="viewer-sensei-thinking">thinking…</span>
                : msg.role === "assistant"
                  ? cleanSenseiText(msg.text)
                  : msg.strategyNoteMove != null ? (
                    <>
                      <div className="viewer-sensei-strategy-kicker">
                        Strategy note · move {msg.strategyNoteMove}
                      </div>
                      <div className="viewer-sensei-strategy-body">{msg.text}</div>
                    </>
                  ) : (
                    msg.text
                  )}
              {msg.streaming && msg.text && <span className="chat-cursor" aria-hidden />}
            </div>
          ))}
        </div>
      )}

      <div className="viewer-sensei-compose">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={hasMessages ? "ask a follow-up…" : "or type your own question…"}
          disabled={isStreaming}
          className="viewer-sensei-input"
        />
        <button type="button" className="gs-btn gs-btn--primary"
          onClick={handleSend} disabled={isStreaming || !input.trim()}
          style={{ padding: "6px 10px", fontSize: 11 }}>↵</button>
      </div>
    </section>
  );
}


function moveDisplayLabel(move: GameStateT["moves"][number], boardSize: number): string {
  if (move.kind === "pass") return "pass";
  if (move.kind === "resign") return "resign";
  if (move.point) return COLS[move.point.col] + (boardSize - move.point.row);
  return "?";
}

type SideTabId = "moves" | "sensei" | "chat";

function PlaySidePanel({
  game,
  gameId,
  state,
  role,
  userId,
  isAiGame,
  playerNotes,
  onNoteSaved,
  onSenseiStreamingChange,
  onSenseiOwnership,
  canUndo,
  isMyTurn,
  preGame,
  swapping,
  onSwap,
  onUndo,
  onPass,
  onResign,
  gameIdCopied,
  onCopyGameId,
  humanChatMessages,
  onSendChat,
}: {
  game: GameT;
  gameId: string;
  state: GameStateT;
  role: ColorCode | null;
  userId: string;
  isAiGame: boolean;
  playerNotes: Record<number, string>;
  onNoteSaved: (mn: number, body: string) => void;
  onSenseiStreamingChange: (v: boolean) => void;
  onSenseiOwnership: (data: number[], boardSize: number) => void;
  canUndo: boolean;
  isMyTurn: boolean;
  preGame: boolean;
  swapping: boolean;
  onSwap: () => void;
  onUndo: () => void;
  onPass: () => void;
  onResign: () => void;
  gameIdCopied: boolean;
  onCopyGameId: () => void;
  humanChatMessages: ChatMessage[];
  onSendChat: (userId: string, message: string) => void;
}) {
  const [tab, setTab] = useState<SideTabId>("moves");
  const senseiStream = useChatStream(gameId, userId);

  const showNotesTooling = isAiGame && !!role && state.status === "active";
  const showSenseiTooling = isAiGame && state.status === "active";

  const tabs: { id: SideTabId; label: string }[] = [
    { id: "moves", label: `Moves · ${state.moves.length}` },
    ...(isAiGame
      ? [{ id: "sensei" as SideTabId, label: "Sensei" }]
      : [{ id: "chat" as SideTabId, label: `Chat · ${humanChatMessages.length}` }]
    ),
  ];

  return (
    <div className="play-side-dock">
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
        <button
          type="button"
          className={`play-side-meta__id${gameIdCopied ? " play-side-meta__id--copied" : ""}`}
          onClick={onCopyGameId}
          title="Copy full game ID"
        >
          {gameIdCopied ? "✓ copied" : `game #${gameId.slice(0, 8)}`}
        </button>
      </div>

      <div className="play-side-body">
        {tab === "moves" && (
          <div
            className="play-side-panel-fill"
            role="tabpanel"
            id="play-tabpanel-moves"
            aria-labelledby="play-tab-moves"
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div className="play-moves-panel">
              <MoveListBody moves={state.moves} boardSize={game.size} />
            </div>
            {showNotesTooling && (
              <div className="play-player-note-shell">
                <PlayerNoteInput
                  gameId={gameId}
                  userId={userId}
                  moveNumber={state.moves.length}
                  existingNote={playerNotes[state.moves.length]}
                  onSaved={(mn, body) => {
                    onNoteSaved(mn, body);
                    senseiStream.appendStrategyNote(mn, body);
                  }}
                  onAfterSave={() => setTab("sensei")}
                />
              </div>
            )}
          </div>
        )}

        {tab === "sensei" && (
          <div
            className="play-side-panel-fill"
            role="tabpanel"
            id="play-tabpanel-sensei"
            aria-labelledby="play-tab-sensei"
          >
            {showSenseiTooling ? (
              <PlaySenseiChat
                stream={senseiStream}
                onStreamingChange={onSenseiStreamingChange}
                onOwnership={onSenseiOwnership}
              />
            ) : (
              <p className="play-side-placeholder">
                Live Sensei coaching appears here during AI games.
              </p>
            )}
          </div>
        )}

        {tab === "chat" && (
          <div
            className="play-side-panel-fill"
            role="tabpanel"
            id="play-tabpanel-chat"
            aria-labelledby="play-tab-chat"
          >
            <HumanChatPanel
              messages={humanChatMessages}
              userId={userId}
              onSend={(msg) => onSendChat(userId, msg)}
            />
          </div>
        )}
      </div>

      <div className="play-side-actions play-side-actions--row3">
        {state.status === "active" ? (
          <>
            <button type="button" className="gs-btn" onClick={onUndo} disabled={!canUndo} style={{ padding: "8px 0", fontSize: 12 }}>Undo</button>
            <button type="button" className="gs-btn" onClick={onPass} disabled={!isMyTurn} style={{ padding: "8px 0", fontSize: 12 }}>Pass</button>
            <button type="button" className="gs-btn gs-btn--red" onClick={onResign} disabled={!isMyTurn} style={{ padding: "8px 0", fontSize: 12 }}>Resign</button>
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
            <a href={`/games/${gameId}/review`} className="result-banner-link">Open review →</a>
          </div>
        )}
      </div>
    </div>
  );
}

function MoveListBody({
  moves,
  boardSize,
}: {
  moves: GameStateT["moves"];
  boardSize: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pairCount = Math.ceil(moves.length / 2);
  const lastIdx = moves.length - 1;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [moves]);

  return (
    <div ref={scrollRef} className="sandwich-move-list">
      <div className="sandwich-move-list-inner">
        {pairCount > 0 &&
          Array.from({ length: pairCount }, (_, row) => {
            const bi = row * 2;
            const wi = row * 2 + 1;
            const blackMove = moves[bi];
            const whiteMove = moves[wi];
            const moveNo = row + 1;
            const isLatestBlack = blackMove !== undefined && bi === lastIdx;
            const isLatestWhite = whiteMove !== undefined && wi === lastIdx;

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
                </span>
                <span className={cellWClass}>
                  {!whiteMove ? "—" : moveDisplayLabel(whiteMove, boardSize)}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function HumanChatPanel({
  messages,
  userId,
  onSend,
}: {
  messages: ChatMessage[];
  userId: string;
  onSend: (msg: string) => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit() {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "10px 12px", boxSizing: "border-box", gap: 8 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {messages.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--font-mono)", margin: 0 }}>No messages yet — say something!</p>
        ) : (
          messages.map((m, i) => {
            const isMe = m.user_id === userId;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "85%",
                  padding: "6px 10px",
                  borderRadius: isMe ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  background: isMe ? "var(--pastel-cyan)" : "var(--bg-2)",
                  border: "1.5px solid var(--ink)",
                  fontSize: 12.5,
                  fontFamily: "var(--font-body)",
                  wordBreak: "break-word",
                }}>
                  {m.message}
                </div>
                <span style={{ fontSize: 10, color: "var(--ink-mute)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                  {isMe ? "you" : "opponent"} · {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, flexShrink: 0 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="message…"
          style={{
            border: "2px solid var(--ink)", borderRadius: 10,
            padding: "7px 10px", fontFamily: "var(--font-body)", fontSize: 12,
            background: "var(--bg)", outline: "none",
          }}
        />
        <button type="button" className="gs-btn gs-btn--primary" onClick={submit} style={{ padding: "6px 10px", fontSize: 11 }}>↵</button>
      </div>
    </div>
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
