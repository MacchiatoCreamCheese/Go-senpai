import { useEffect, useRef, useState } from "react";

import { createGame, fetchGame, getPlayerNotes, playMove, requestAiMove, sgfUrl, swapColors } from "./api";
import { GoBoard } from "./GoBoard";
import { UserChip } from "./components/UserChip";
import { LiveTierDot } from "./components/LiveTierDot";
import { ChatDrawer } from "./components/ChatDrawer";
import { MoveHistory } from "./components/MoveHistory";
import { PlayerNoteInput } from "./components/PlayerNoteInput";
import { connectGameSocket } from "./ws";
import type { ColorCode, GameT, GameStateT, MoveKind, PointT } from "./types";

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
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset overlay dismiss when switching games.
  useEffect(() => { setOverlayDismissed(false); }, [gameId]);

  // Load player notes on mount
  useEffect(() => {
    const uid = localStorage.getItem(USER_ID_KEY);
    if (uid) getPlayerNotes(gameId, uid).then(setPlayerNotes);
  }, [gameId]);

  const role = deriveRole(game, localStorage.getItem(USER_ID_KEY));

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
  const turnLabel = state.turn === "B" ? "Black" : "White";
  const turnColorClass = state.turn === "B" ? "black" : "white";
  const preGame = state.moves.length === 0 && state.status === "active";
  const bothSeated = !!game.black_user_id && !!game.white_user_id;

  return (
    <div style={styles.layout}>
      {/* Board */}
      <div style={styles.boardArea}>
        <div className="ai-thinking-shell">
          <GoBoard state={state} disabled={disabled} onPlay={(p) => send("play", p)} />
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
        {/* Game ID */}
        <div style={styles.idRow}>
          <span className="tag">{gameId}</span>
          <button
            className="copy-btn"
            onClick={copyId}
            title="Copy game ID"
            style={copied ? { color: "#2D6A2D" } : undefined}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>

        {/* Meta chips */}
        <div style={styles.metaRow}>
          <span style={styles.chip}>{game.size}×{game.size}</span>
          <span style={styles.chipSep}>·</span>
          <span style={styles.chip}>komi {game.komi}</span>
        </div>

        <hr className="divider" style={{ margin: "20px 0" }} />

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
              className="btn btn-ghost"
              onClick={onSwap}
              disabled={swapping}
              style={{ marginTop: 10, padding: "6px 12px", fontSize: "0.85rem" }}
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
            pendingCount={Math.max(0, state.moves.length - liveTiers.size)}
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

        {/* Ask Sensei coach button (AI games only) */}
        {game?.opponent_type === "ai" && state?.status === "active" && (
          <button
            className="btn btn-ghost ask-coach-btn"
            onClick={() => setChatOpen(true)}
            title="Open the Sensei coach (C)"
          >
            {chatOpen && senseiThinking ? "Sensei is thinking…" : "Ask Sensei"}{" "}
            <kbd>C</kbd>
          </button>
        )}

        <hr className="divider" style={{ margin: "20px 0" }} />

        {/* Actions or result */}
        {state.status === "active" ? (
          <div style={styles.actionRow}>
            <button
              className="btn btn-ghost"
              onClick={() => send("pass", null)}
              disabled={!isMyTurn}
            >
              Pass
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => send("resign", null)}
              disabled={!isMyTurn}
              style={{ color: "var(--seal)", borderColor: "var(--seal)" }}
            >
              Resign
            </button>
          </div>
        ) : (
          <div className="result-banner">
            <strong>Game over</strong>
            <span>{state.result ?? state.status}</span>
            <a href={`/games/${gameId}`} className="result-banner-link">
              Open review viewer →
            </a>
          </div>
        )}

        {error && (
          <p className="error-text" style={{ marginTop: 12 }}>{error}</p>
        )}

        <hr className="divider" style={{ margin: "20px 0" }} />

        {/* Footer links */}
        <div style={styles.footerLinks}>
          <a
            href={sgfUrl(gameId)}
            download
            style={styles.textLink}
          >
            Export SGF
          </a>
          <button className="btn btn-ghost" onClick={onExit} style={{ padding: "7px 16px", fontSize: "0.9rem" }}>
            ← Lobby
          </button>
        </div>
      </aside>

      <ChatDrawer
        gameId={gameId}
        userId={localStorage.getItem(USER_ID_KEY) ?? ""}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onStreamingChange={setSenseiThinking}
      />

      {state.status !== "active" && !overlayDismissed && (
        <div className="postgame-overlay" role="dialog" aria-modal="true" onClick={() => setOverlayDismissed(true)}>
          <div className="postgame-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="postgame-close"
              type="button"
              onClick={() => setOverlayDismissed(true)}
              aria-label="Dismiss"
            >×</button>
            <div className="postgame-eyebrow">Game over</div>
            <h2 className="postgame-result">{state.result ?? state.status}</h2>
            <p className="postgame-sub">
              {role
                ? `You played ${role === "B" ? "Black" : "White"}${
                    game.opponent_type === "ai" ? ` against Sensei AI ${game.ai_rank ?? "?"}k.` : "."
                  }`
                : "You watched as a spectator."}
            </p>
            <div className="postgame-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => (onOpenReview ? onOpenReview(gameId) : (window.location.href = `/games/${gameId}`))}
              >
                Review this game
              </button>
              <button type="button" className="btn btn-ghost" onClick={onExit}>
                Back to lobby
              </button>
              {game.opponent_type === "ai" && role && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handlePlayAgain}
                  disabled={playAgainPending}
                >
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
    minHeight: "100vh",
    display: "flex",
    flexWrap: "wrap",
    gap: 32,
    padding: "32px 28px",
    alignItems: "flex-start",
    justifyContent: "center",
  },
  boardArea: {
    display: "flex",
    alignItems: "flex-start",
    animation: "fadeSlide 400ms ease both",
  },
  panel: {
    width: 260,
    minWidth: 220,
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
    fontStyle: "italic",
    fontSize: "1.2rem",
    color: "var(--stone)",
    letterSpacing: "0.05em",
  },
  idRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  chip: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.78rem",
    color: "var(--stone)",
    letterSpacing: "0.04em",
  },
  chipSep: {
    color: "var(--line-dark)",
    fontSize: "0.9rem",
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    display: "block",
    fontFamily: "var(--font-body)",
    fontSize: "0.78rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--stone)",
    marginBottom: 6,
  },
  turnRow: {
    display: "flex",
    alignItems: "center",
  },
  turnText: {
    fontFamily: "var(--font-body)",
    fontSize: "0.95rem",
    color: "var(--ink)",
  },
  capturesRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  captureCount: {
    fontFamily: "var(--font-mono)",
    fontSize: "0.9rem",
    color: "var(--ink)",
    minWidth: 20,
  },
  captureSep: {
    width: 16,
  },
  actionRow: {
    display: "flex",
    gap: 10,
  },
  footerLinks: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  textLink: {
    fontFamily: "var(--font-body)",
    fontSize: "0.9rem",
    color: "var(--stone)",
    textDecoration: "none",
    borderBottom: "1px solid var(--line-dark)",
    transition: "color 150ms, border-color 150ms",
  },
};
