import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { createGame, createUser, fetchGame, getMyGames, joinGame } from "../api";
import type { ColorCode } from "../types";

const USER_ID_KEY = "senpai_user_id";
const USER_HANDLE_KEY = "senpai_user_handle";

export default function Lobby() {
  const navigate = useNavigate();
  const [joinInput, setJoinInput] = useState("");
  const [handle, setHandle] = useState(() => localStorage.getItem(USER_HANDLE_KEY) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [color, setColor] = useState<ColorCode>("B");
  const [opponent, setOpponent] = useState<"human" | "ai">("human");
  const [aiRank, setAiRank] = useState<number>(10);

  const userId = localStorage.getItem(USER_ID_KEY);
  const myGames = useQuery({
    queryKey: ["my-games", userId],
    queryFn: () => (userId ? getMyGames(userId) : Promise.resolve([])),
    enabled: !!userId,
  });
  const activeGames = (myGames.data ?? []).filter((g) => !g.result).slice(0, 6);

  function go(id: string) {
    navigate(`/play/${id}`);
  }

  async function ensureUser(): Promise<string> {
    const name = handle.trim() || "anonymous";
    const user = await createUser(name);
    localStorage.setItem(USER_ID_KEY, user.id);
    localStorage.setItem(USER_HANDLE_KEY, user.handle);
    return user.id;
  }

  async function join(id: string) {
    setError(null);
    try {
      const userId = await ensureUser();
      const game = await fetchGame(id).catch(() => null);
      if (!game) {
        setError("Game not found.");
        return;
      }
      const alreadySeated =
        game.black_user_id === userId || game.white_user_id === userId;
      if (!alreadySeated) {
        await joinGame(id, userId);
      }
      go(id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function create(size: 9 | 13 | 19) {
    setError(null);
    setCreating(true);
    try {
      const userId = await ensureUser();
      const game = await createGame(size, userId, color, {
        opponentType: opponent,
        aiRank: opponent === "ai" ? aiRank : undefined,
      });
      go(game.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  function rankLabel(r: number): string {
    return r > 0 ? `${r}k` : `${1 - r}d`;
  }

  return (
    <div style={styles.page}>
      <div style={styles.kanji} aria-hidden="true">碁</div>

      <div style={styles.content}>
        <header style={{ ...styles.section, animationDelay: "0ms" }}>
          <h1 style={styles.title}>Lobby</h1>
          <p style={styles.tagline}>
            Two players. One board. Ancient wisdom, modern game.
          </p>
        </header>

        <hr className="divider" />

        {activeGames.length > 0 && (
          <section style={styles.section}>
            <div className="active-games-strip">
              <span className="active-games-strip-label">Resume an in-progress game</span>
              <div className="active-games-row">
                {activeGames.map((g) => (
                  <Link
                    key={g.id}
                    to={`/play/${g.id}`}
                    className="active-game-card"
                  >
                    <div className="active-game-card-line">
                      <span>{g.board_size}×{g.board_size}</span>
                      <span className="active-game-card-resume">Resume →</span>
                    </div>
                    <span className="active-game-card-id">{g.id.slice(0, 8)}…</span>
                  </Link>
                ))}
              </div>
            </div>
            <hr className="divider" />
          </section>
        )}

        <section style={{ ...styles.section, animationDelay: "40ms" }}>
          <h2 style={styles.sectionLabel}>Your name</h2>
          <p style={styles.hint}>
            This is who you play as. Change it before joining to play as a different person.
          </p>
          <div style={styles.joinRow}>
            <input
              className="input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="nickname"
              style={{ flex: 1 }}
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
            />
          </div>
        </section>

        <hr className="divider" />

        <section style={{ ...styles.section, animationDelay: "80ms" }}>
          <h2 style={styles.sectionLabel}>New game</h2>
          <p style={styles.hint}>Pick your opponent, colour, and board size.</p>

          <div style={styles.colorRow}>
            {(["human", "ai"] as const).map((o) => (
              <button
                key={o}
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpponent(o)}
                style={{
                  ...styles.colorBtn,
                  borderColor: opponent === o ? "var(--ink)" : "var(--line-dark)",
                  fontWeight: opponent === o ? 600 : 400,
                }}
              >
                {o === "human" ? "vs Human" : "vs Sensei AI"}
              </button>
            ))}
          </div>

          {opponent === "ai" && (
            <div style={styles.rankRow}>
              <label style={styles.rankLabel}>
                Sensei rank: <strong>{rankLabel(aiRank)}</strong>
              </label>
              <input
                type="range"
                min={-3}
                max={20}
                step={1}
                value={aiRank}
                onChange={(e) => setAiRank(parseInt(e.target.value, 10))}
                style={styles.rankSlider}
              />
              <div style={styles.rankScale}>
                <span>4d</span><span>1d/1k</span><span>20k</span>
              </div>
            </div>
          )}

          <div style={styles.colorRow}>
            {(["B", "W"] as const).map((c) => (
              <button
                key={c}
                type="button"
                className="btn btn-ghost"
                onClick={() => setColor(c)}
                style={{
                  ...styles.colorBtn,
                  borderColor: color === c ? "var(--ink)" : "var(--line-dark)",
                  fontWeight: color === c ? 600 : 400,
                }}
              >
                <span className={`stone-dot ${c === "B" ? "black" : "white"}`} />
                {c === "B" ? "Black" : "White"}
                {c === "B" && <span style={styles.colorHint}>moves first</span>}
              </button>
            ))}
          </div>
          <div style={styles.sizeRow}>
            {([9, 13, 19] as const).map((size) => (
              <button
                key={size}
                className="btn btn-primary"
                onClick={() => create(size)}
                disabled={creating || !handle.trim()}
                style={styles.sizeBtn}
              >
                <span style={styles.stoneDot} />
                {size}×{size}
              </button>
            ))}
          </div>
        </section>

        <hr className="divider" />

        {opponent === "human" && (
          <section style={{ ...styles.section, animationDelay: "160ms" }}>
            <h2 style={styles.sectionLabel}>Join game</h2>
            <p style={styles.hint}>Paste a game ID to join an in-progress game.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (joinInput.trim()) join(joinInput.trim());
              }}
              style={styles.joinRow}
            >
              <input
                className="input"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="game-id"
                style={{ flex: 1 }}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="btn btn-ghost"
                disabled={!joinInput.trim() || !handle.trim()}
              >
                Join
              </button>
            </form>
          </section>
        )}

        {error && (
          <p className="error-text" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}

        <footer style={styles.footer}>
          <span style={styles.footerDot} />
          <span style={styles.footerDot} />
          <span style={styles.footerDot} />
        </footer>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    position: "relative",
    overflow: "hidden",
  },
  kanji: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "clamp(260px, 40vw, 520px)",
    lineHeight: 1,
    fontFamily: "var(--font-display)",
    fontWeight: 300,
    color: "var(--ink)",
    opacity: 0.04,
    pointerEvents: "none",
    userSelect: "none",
    letterSpacing: "-0.02em",
  },
  content: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 480,
  },
  section: { animation: "fadeSlide 500ms ease both" },
  title: {
    fontSize: "clamp(52px, 9vw, 80px)",
    fontWeight: 300,
    letterSpacing: "0.01em",
    lineHeight: 1.05,
    marginBottom: 14,
  },
  tagline: {
    fontFamily: "var(--font-body)",
    fontStyle: "italic",
    fontSize: "1.1rem",
    color: "var(--stone)",
    letterSpacing: "0.01em",
  },
  sectionLabel: { marginBottom: 6 },
  hint: { fontSize: "0.95rem", color: "var(--stone)", marginBottom: 16 },
  sizeRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  colorRow: { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  colorBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    fontSize: "0.95rem",
    transition: "border-color 150ms",
  },
  colorHint: { fontSize: "0.78rem", color: "var(--stone)", marginLeft: 4 },
  sizeBtn: { fontSize: "1.05rem", letterSpacing: "0.01em", minWidth: 96, justifyContent: "center" },
  stoneDot: {
    display: "inline-block",
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: "currentColor",
    opacity: 0.7,
    flexShrink: 0,
  },
  joinRow: { display: "flex", gap: 10, alignItems: "stretch" },
  footer: { marginTop: 48, display: "flex", gap: 8, justifyContent: "center" },
  rankRow: { marginBottom: 14 },
  rankLabel: { display: "block", fontSize: "0.9rem", color: "var(--stone)", marginBottom: 6 },
  rankSlider: { width: "100%" },
  rankScale: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "var(--font-mono)",
    fontSize: "0.72rem",
    color: "var(--stone)",
    marginTop: 4,
  },
  footerDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--line-dark)",
  },
};
