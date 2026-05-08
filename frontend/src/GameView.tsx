import { useEffect, useMemo, useRef, useState } from "react";

import { createGame, fetchGame, getPlayerNotes, playMove, requestAiMove, sgfUrl, swapColors, undoMove } from "./api";
import { GoBoard } from "./GoBoard";
import { UserChip } from "./components/UserChip";
import { LiveTierDot } from "./components/LiveTierDot";
import { ChatDrawer } from "./components/ChatDrawer";
import { MoveHistory } from "./components/MoveHistory";
import { PlayerNoteInput } from "./components/PlayerNoteInput";
import { connectGameSocket } from "./ws";
import type { ColorCode, GameT, GameStateT, MoveKind, PointT } from "./types";
import type { GhostStone } from "@sabaki/shudan";

const USER_ID_KEY = "senpai_user_id";

interface Props {
  gameId: string;
  onExit: () => void;
  /** Hand off to a new game with the same settings (AI games only). */
  onPlayAgain?: (newGameId: string) => void;
  /** Push the user to the completed-game viewer. */
  onOpenReview?: (gameId: string) => void;
}

function deriveRole(game: GameT | null, userId: string | null): ColorCode | null {
  if (!game || !userId) return null;
  if (game.black_user_id === userId) return "B";
  if (game.white_user_id === userId) return "W";
  return null;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
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

  // Reset overlay dismiss when switching games.
  useEffect(() => { setOverlayDismissed(false); }, [gameId]);

  // Load player notes on mount
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

  // Kick the AI if it's already its turn on load (e.g. user picked White).
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
    // Intentionally excluding aiThinking from deps to avoid re-triggering mid-request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.opponent_type, state?.turn, state?.status, role, gameId]);

  useEffect(() => {
    setLiveTiers(new Map()); // reset tiers when game changes
    const close = connectGameSocket(
      gameId,
      (s) => setState(s),
      (players) =>
        setGame((prev) =>
          prev
            ? {
                ...prev,
                black_user_id: players.black_user_id,
                white_user_id: players.white_user_id,
              }
            : prev,
        ),
      (e) => setLiveTiers((prev) => new Map(prev).set(e.move_number, e.tier)),
    );
    return close;
  }, [gameId]);

  // Keyboard shortcut: C to open/close coach drawer (not when typing in an input)
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
    if (!role) {
      setError("You're not seated in this game yet.");
      return;
    }
    setError(null);
    try {
      const next = await playMove(gameId, role, kind, point);
      setState(next);
      // In AI games the kick-off effect picks this up once state.turn flips.
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
      // Remove liveTier entries for the two undone moves
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
  const turnLabel = state.turn === "B" ? "Black" : "White";
  const turnColorClass = state.turn === "B" ? "black" : "white";
  const preGame = state.moves.length === 0 && state.status === "active";
  const bothSeated = !!game.black_user_id && !!game.white_user_id;

  return (
    <div style={styles.layout}>
      {/* Board */}
      <div style={styles.boardArea}>
        <div className="ai-thinking-shell">
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
      </div>

      {/* Panel */}
      <aside style={styles.panel}>
        {/* Game ID + meta */}
        <div className="gs-card" style={{ padding: "12px 16px", background: "var(--pastel-cyan)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={styles.idRow}>
            <span className="gs-tag">{gameId.slice(0, 8)}…</span>
            <button
              className="copy-btn"
              onClick={copyId}
              title="Copy game ID"
              style={copied ? { color: "var(--tier-good)" } : undefined}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
          <div style={styles.metaRow}>
            <span className="gs-pill" style={{ fontSize: 11, padding: "2px 10px" }}>{game.size}×{game.size}</span>
            <span className="gs-pill" style={{ fontSize: 11, padding: "2px 10px" }}>komi {game.komi}</span>
          </div>
        </div>

        {/* Players */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Players</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <UserChip
              userId={game.black_user_id}
              handle={role === "B" ? "You" : undefined}
              aiRank={game.ai_rank}
              color="B"
            />
            <UserChip
              userId={game.white_user_id}
              handle={role === "W" ? "You" : undefined}
              aiRank={game.ai_rank}
              color="W"
            />
          </div>
          {preGame && role && (
            <button
              type="button"
              className="gs-btn"
              onClick={onSwap}
              disabled={swapping}
              style={{ padding: "6px 12px", fontSize: 12 }}
              title={bothSeated ? "Swap colours with opponent" : "Swap your seat (no opponent yet)"}
            >
              {swapping ? "swapping…" : "Swap colours"}
            </button>
          )}
        </div>

        {/* Turn */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Turn</label>
          <div style={styles.turnRow}>
            <span className={`stone-dot ${turnColorClass}`} />
            <span style={styles.turnText}>
              {state.status === "active"
                ? isMyTurn
                  ? `${turnLabel} — your move`
                  : aiThinking
                    ? `${turnLabel} — Sensei is thinking…`
                    : `${turnLabel} — waiting`
                : "—"}
            </span>
          </div>
        </div>

        {/* Captures */}
        <div style={styles.field}>
          <label style={styles.fieldLabel}>Captures</label>
          <div style={styles.capturesRow}>
            <span className="stone-dot black" />
            <span style={styles.captureCount}>{state.captures.B}</span>
            <span style={styles.captureSep} />
            <span className="stone-dot white" />
            <span style={styles.captureCount}>{state.captures.W}</span>
          </div>
        </div>

        {/* Live training-mode tier strip */}
        {game?.training_mode && game.opponent_type === "ai" && role && (
          <LiveTierDot
            gameId={gameId}
            userId={localStorage.getItem(USER_ID_KEY) ?? ""}
            tiers={liveTiers}
            pendingCount={state.moves.reduce((n, m, i) =>
              m.color === role && !liveTiers.has(i + 1) ? n + 1 : n, 0)}
            onShowOnBoard={() => {/* board not scrubable in live mode */}}
          />
        )}

        {/* Move history */}
        {state.moves.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label style={styles.fieldLabel}>Move history</label>
            <MoveHistory moves={state.moves} boardSize={game?.size ?? 19} />
          </div>
        )}

        {/* Player strategy note */}
        {role && state.status === "active" && game?.opponent_type === "ai" && (
          <PlayerNoteInput
            gameId={gameId}
            userId={localStorage.getItem(USER_ID_KEY) ?? ""}
            moveNumber={state.moves.length}
            existingNote={playerNotes[state.moves.length]}
            onSaved={(mn, body) =>
              setPlayerNotes((prev) => ({ ...prev, [mn]: body }))
            }
          />
        )}

        {/* Ask Sensei (AI games only) */}
        {game?.opponent_type === "ai" && state?.status === "active" && (
          <button
            className="gs-btn gs-btn--cyan"
            onClick={() => setChatOpen(true)}
            style={{ width: "100%" }}
            title="Open the Sensei coach (C)"
          >
            {chatOpen && senseiThinking ? "Sensei is thinking…" : "Ask Sensei 先"}
          </button>
        )}

        {/* Actions or result */}
        {state.status === "active" ? (
          <div style={styles.actionRow}>
            <button
              className="gs-btn"
              onClick={() => send("pass", null)}
              disabled={!isMyTurn}
              style={{ flex: 1 }}
            >
              Pass
            </button>
            {isAiGame && (
              <button
                className="gs-btn"
                onClick={handleUndo}
                disabled={!canUndo}
                style={{ flex: 1 }}
              >
                Undo
              </button>
            )}
            <button
              className="gs-btn gs-btn--red"
              onClick={() => send("resign", null)}
              disabled={!isMyTurn}
              style={{ flex: 1 }}
            >
              Resign
            </button>
          </div>
        ) : (
          <div className="result-banner">
            <strong>Game over</strong>
            <span>{state.result ?? state.status}</span>
            <a href={`/games/${gameId}`} className="result-banner-link">
              Open review →
            </a>
          </div>
        )}

        {error && (
          <p className="error-text" style={{ marginTop: 8 }}>{error}</p>
        )}

        {/* Footer links */}
        <div style={styles.footerLinks}>
          <a href={sgfUrl(gameId)} download style={styles.textLink}>Export SGF</a>
          <button className="gs-btn" onClick={onExit} style={{ padding: "7px 14px", fontSize: 13 }}>
            ← Lobby
          </button>
        </div>
      </aside>

      <ChatDrawer
        gameId={gameId}
        userId={localStorage.getItem(USER_ID_KEY) ?? ""}
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
              style={{
                position: "absolute", top: 12, right: 12,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 20, color: "var(--ink-mute)", lineHeight: 1,
              }}
            >×</button>
            <div className="gs-tag" style={{ marginBottom: 12 }}>GAME OVER</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 40, lineHeight: 1, marginBottom: 10 }}>
              {state.result ?? state.status}
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
              {role
                ? `You played ${role === "B" ? "Black" : "White"}${
                    game.opponent_type === "ai" ? ` against Sensei AI ${game.ai_rank ?? "?"}k.` : "."
                  }`
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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    flex: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: 24,
    padding: "24px 28px",
    alignItems: "flex-start",
    justifyContent: "center",
    overflowY: "auto",
  },
  boardArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 14,
    animation: "fadeSlide 400ms ease both",
  },
  panel: {
    width: 280,
    minWidth: 240,
    display: "flex",
    flexDirection: "column",
    gap: 14,
    animation: "fadeSlide 400ms 80ms ease both",
  },
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
  idRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 10px",
    border: "1.5px solid var(--ink)",
    borderRadius: 999,
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    background: "var(--bg-2)",
    letterSpacing: "0.03em",
  },
  chipSep: {
    color: "var(--line-dark)",
    fontSize: "0.9rem",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  fieldLabel: {
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.1em",
    color: "var(--ink-mute)",
  },
  turnRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  turnText: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 14,
    color: "var(--ink)",
  },
  capturesRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  captureCount: {
    fontFamily: "var(--font-mono)",
    fontWeight: 600,
    fontSize: 14,
    color: "var(--ink)",
    minWidth: 20,
  },
  captureSep: {
    width: 12,
  },
  actionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
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
    transition: "color 150ms",
  },
};
