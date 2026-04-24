import { useEffect, useRef, useState } from "react";

import { createGame, createUser } from "./api";
import { GameView } from "./GameView";

const USER_ID_KEY = "senpai_user_id";
const USER_HANDLE_KEY = "senpai_user_handle";

function readHash(): string | null {
  const m = window.location.hash.match(/^#\/game\/([^/]+)$/);
  return m ? m[1] : null;
}

export function App() {
  const [gameId, setGameId] = useState<string | null>(() => readHash());
  const [joinInput, setJoinInput] = useState("");
  const [handle, setHandle] = useState(() => localStorage.getItem(USER_HANDLE_KEY) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const handleRef = useRef<HTMLInputElement>(null);

  const hasUser = !!localStorage.getItem(USER_ID_KEY);
  const [identified, setIdentified] = useState(hasUser);

  useEffect(() => {
    const onHash = () => setGameId(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function go(id: string) {
    window.location.hash = `#/game/${id}`;
    setGameId(id);
  }

  function exit() {
    window.location.hash = "";
    setGameId(null);
  }

  async function ensureUser(): Promise<string> {
    const stored = localStorage.getItem(USER_ID_KEY);
    if (stored) return stored;
    const user = await createUser(handle.trim() || "anonymous");
    localStorage.setItem(USER_ID_KEY, user.id);
    localStorage.setItem(USER_HANDLE_KEY, user.handle);
    setIdentified(true);
    return user.id;
  }

  async function create(size: 9 | 13 | 19) {
    setError(null);
    setCreating(true);
    try {
      const userId = await ensureUser();
      const game = await createGame(size, userId);
      go(game.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }

  if (gameId) return <GameView gameId={gameId} onExit={exit} />;

  return (
    <div style={styles.page}>
      {/* Decorative kanji watermark */}
      <div style={styles.kanji} aria-hidden="true">碁</div>

      <div style={styles.content}>
        {/* Hero */}
        <header style={{ ...styles.section, animationDelay: "0ms" }}>
          <h1 style={styles.title}>Go-senpai</h1>
          <p style={styles.tagline}>
            Two players. One board. Ancient wisdom, modern game.
          </p>
        </header>

        <hr className="divider" />

        {/* Handle */}
        {!identified && (
          <section style={{ ...styles.section, animationDelay: "40ms" }}>
            <h2 style={styles.sectionLabel}>Your name</h2>
            <p style={styles.hint}>Used to track your games. No account needed.</p>
            <div style={styles.joinRow}>
              <input
                ref={handleRef}
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
        )}

        {identified && (
          <section style={{ ...styles.section, animationDelay: "40ms" }}>
            <p style={styles.hint}>
              Playing as <strong>{localStorage.getItem(USER_HANDLE_KEY) || "you"}</strong>
              {" · "}
              <button
                className="btn btn-ghost"
                style={{ padding: "2px 8px", fontSize: "0.85rem" }}
                onClick={() => {
                  localStorage.removeItem(USER_ID_KEY);
                  localStorage.removeItem(USER_HANDLE_KEY);
                  setIdentified(false);
                  setHandle("");
                }}
              >
                change
              </button>
            </p>
          </section>
        )}

        <hr className="divider" />

        {/* New game */}
        <section style={{ ...styles.section, animationDelay: "80ms" }}>
          <h2 style={styles.sectionLabel}>New game</h2>
          <p style={styles.hint}>Choose a board size to begin.</p>
          <div style={styles.sizeRow}>
            {([9, 13, 19] as const).map((size) => (
              <button
                key={size}
                className="btn btn-primary"
                onClick={() => create(size)}
                disabled={creating || (!identified && !handle.trim())}
                style={styles.sizeBtn}
              >
                <span style={styles.stoneDot} />
                {size}×{size}
              </button>
            ))}
          </div>
        </section>

        <hr className="divider" />

        {/* Join game */}
        <section style={{ ...styles.section, animationDelay: "160ms" }}>
          <h2 style={styles.sectionLabel}>Join game</h2>
          <p style={styles.hint}>Paste a game ID to join an in-progress game.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (joinInput.trim()) go(joinInput.trim());
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
              disabled={!joinInput.trim()}
            >
              Join
            </button>
          </form>
        </section>

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
    minHeight: "100vh",
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
  section: {
    animation: "fadeSlide 500ms ease both",
  },
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
  sectionLabel: {
    marginBottom: 6,
  },
  hint: {
    fontSize: "0.95rem",
    color: "var(--stone)",
    marginBottom: 16,
  },
  sizeRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  sizeBtn: {
    fontSize: "1.05rem",
    letterSpacing: "0.01em",
    minWidth: 96,
    justifyContent: "center",
  },
  stoneDot: {
    display: "inline-block",
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: "currentColor",
    opacity: 0.7,
    flexShrink: 0,
  },
  joinRow: {
    display: "flex",
    gap: 10,
    alignItems: "stretch",
  },
  footer: {
    marginTop: 48,
    display: "flex",
    gap: 8,
    justifyContent: "center",
  },
  footerDot: {
    display: "inline-block",
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--line-dark)",
  },
};
