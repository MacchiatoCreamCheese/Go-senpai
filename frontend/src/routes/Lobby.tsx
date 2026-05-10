import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { createGame, createUser, fetchGame, getMyGames, joinGame } from "../api";
import type { ColorCode } from "../types";
import { HANDLE_KEY as USER_HANDLE_KEY, USER_ID_KEY, useAuth } from "../lib/auth";

import beginnerImg from "../bot_image/beginner.jpg";
import intermediateImg from "../bot_image/intermediate.jpg";
import advancedImg from "../bot_image/advanced.jpg";

const BOTS = [
  { id: "beginner",     label: "Beginner",     rank: 18, desc: "Great for new players",  img: beginnerImg },
  { id: "intermediate", label: "Intermediate", rank: 8,  desc: "A balanced challenge",   img: intermediateImg },
  { id: "advanced",     label: "Advanced",     rank: -2, desc: "Test your limits",        img: advancedImg },
] as const;

type BotTier = typeof BOTS[number]["id"];

export default function Lobby() {
  const navigate = useNavigate();
  const { user, legacy } = useAuth();
  const [joinInput, setJoinInput] = useState("");
  const [handle, setHandle] = useState(() => localStorage.getItem(USER_HANDLE_KEY) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [color, setColor] = useState<ColorCode>("B");
  const [opponent, setOpponent] = useState<"human" | "ai">("human");
  const [aiRank, setAiRank] = useState<number>(8);
  const [botTier, setBotTier] = useState<BotTier | null>("intermediate");
  const [trainingMode, setTrainingMode] = useState(true);

  const supabaseUserId = !legacy && user ? user.id : null;
  const userId = supabaseUserId ?? localStorage.getItem(USER_ID_KEY);

  const myGames = useQuery({
    queryKey: ["my-games", userId],
    queryFn: () => (userId ? getMyGames(userId) : Promise.resolve([])),
    enabled: !!userId,
  });
  const activeGames = (myGames.data ?? []).filter((g) => !g.result);
  const [resumePage, setResumePage] = useState(0);
  const PAGE_SIZE = 3;
  const totalPages = Math.max(1, Math.ceil(activeGames.length / PAGE_SIZE));
  const pagedGames = activeGames.slice(resumePage * PAGE_SIZE, (resumePage + 1) * PAGE_SIZE);

  function go(id: string) {
    navigate(`/play/${id}`);
  }

  async function ensureUser(): Promise<string> {
    if (supabaseUserId) {
      localStorage.setItem(USER_ID_KEY, supabaseUserId);
      if (user?.email) localStorage.setItem(USER_HANDLE_KEY, user.email);
      return supabaseUserId;
    }
    const name = handle.trim() || "anonymous";
    const u = await createUser(name);
    localStorage.setItem(USER_ID_KEY, u.id);
    localStorage.setItem(USER_HANDLE_KEY, u.handle);
    return u.id;
  }

  async function join(id: string) {
    setError(null);
    try {
      const uid = await ensureUser();
      const game = await fetchGame(id).catch(() => null);
      if (!game) { setError("Game not found."); return; }
      const alreadySeated = game.black_user_id === uid || game.white_user_id === uid;
      if (!alreadySeated) await joinGame(id, uid);
      go(id);
    } catch (e) {
      setError(String(e));
    }
  }

  async function create(size: 9 | 13 | 19) {
    setError(null);
    setCreating(true);
    try {
      const uid = await ensureUser();
      const game = await createGame(size, uid, color, {
        opponentType: opponent,
        aiRank: opponent === "ai" ? aiRank : undefined,
        trainingMode: opponent === "ai" ? trainingMode : undefined,
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

  const hasActiveGames = activeGames.length > 0;

  return (
    <div className="lobby-page">
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 28 }}>

        {/* ── Header ── */}
        <div>
          <span className="home-eyebrow">Play</span>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: "clamp(28px, 5vw, 44px)",
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            margin: "12px 0 6px",
          }}>
            Start a game · 碁
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
            Two players. One board. Ancient wisdom, modern game.
          </p>
        </div>

        {/* ── Main grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
          gap: 24,
          alignItems: "start",
        }}>

          {/* ── Left: New Game card ── */}
          <div className="gs-card gs-card--ink" style={{
            padding: "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            background: "var(--bg-2)",
          }}>
            <div className="gs-section-h">NEW GAME</div>

            {/* Legacy name input */}
            {legacy && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="login-label">Your name</label>
                <input
                  className="input"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="nickname"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                />
              </div>
            )}

            {/* Opponent selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="login-label">Opponent</label>
              <div className="lobby-seg">
                <button
                  className={"lobby-seg-btn" + (opponent === "human" ? " is-active" : "")}
                  onClick={() => setOpponent("human")}
                >
                  👥 vs Human
                </button>
                <button
                  className={"lobby-seg-btn" + (opponent === "ai" ? " is-active" : "")}
                  onClick={() => setOpponent("ai")}
                >
                  先 vs Sensei AI
                </button>
              </div>
            </div>

            {/* Bot cards + slider — AI only */}
            {opponent === "ai" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label className="login-label">Choose your opponent</label>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {BOTS.map((b) => (
                      <button
                        key={b.id}
                        className={"lobby-bot-card" + (botTier === b.id ? " is-selected" : "")}
                        onClick={() => { setBotTier(b.id); setAiRank(b.rank); }}
                      >
                        <img src={b.img} alt={b.label} className="lobby-bot-img" />
                        <span className="lobby-bot-name">{b.label}</span>
                        <span className="lobby-bot-rank">{rankLabel(b.rank)}</span>
                        <span style={{ fontSize: 11, color: "inherit", opacity: 0.65 }}>{b.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fine-tune slider */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label className="login-label">
                    Fine-tune difficulty —{" "}
                    <strong style={{ fontFamily: "var(--font-mono)" }}>{rankLabel(aiRank)}</strong>
                  </label>
                  <input
                    type="range"
                    min={-3}
                    max={20}
                    step={1}
                    value={aiRank}
                    onChange={(e) => {
                      const r = parseInt(e.target.value, 10);
                      setAiRank(r);
                      setBotTier(BOTS.find((b) => b.rank === r)?.id ?? null);
                    }}
                    style={{ width: "100%" }}
                  />
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--ink-mute)",
                  }}>
                    <span>4d ←</span><span>1d / 1k</span><span>→ 20k</span>
                  </div>
                </div>

                {/* Training mode */}
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: 13,
                  padding: "10px 14px",
                  border: "2px solid var(--line-dark)",
                  borderRadius: 12,
                  background: trainingMode ? "var(--pastel-yellow)" : "var(--bg)",
                  transition: "background 150ms",
                }}>
                  <input
                    type="checkbox"
                    checked={trainingMode}
                    onChange={(e) => setTrainingMode(e.target.checked)}
                  />
                  Training mode — coaching dots after each move
                </label>
              </div>
            )}

            {/* Colour selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="login-label">Your colour</label>
              <div style={{ display: "flex", gap: 10 }}>
                {(["B", "W"] as const).map((c) => (
                  <button
                    key={c}
                    className={"gs-btn" + (color === c ? " gs-btn--primary" : "")}
                    onClick={() => setColor(c)}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    <span className={`stone-dot ${c === "B" ? "black" : "white"}`} />
                    {c === "B" ? "Black" : "White"}
                    {c === "B" && (
                      <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 4 }}>moves first</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Board size */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="login-label">Board size — tap to start</label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {([9, 13, 19] as const).map((size) => (
                  <button
                    key={size}
                    className="gs-btn gs-btn--primary"
                    style={{ flex: "1 1 80px", justifyContent: "center", fontSize: 17, letterSpacing: "0.01em" }}
                    onClick={() => create(size)}
                    disabled={creating || (legacy && !handle.trim())}
                  >
                    {size}×{size}
                  </button>
                ))}
              </div>
              {creating && (
                <p style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--font-display)" }}>
                  Starting game…
                </p>
              )}
            </div>

            {/* Join game — human only */}
            {opponent === "human" && (
              <div style={{
                borderTop: "2px solid var(--line)",
                paddingTop: 20,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}>
                <label className="login-label">Join an existing game</label>
                <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0 }}>
                  Have a game ID? Paste it here.
                </p>
                <form
                  style={{ display: "flex", gap: 10 }}
                  onSubmit={(e) => { e.preventDefault(); if (joinInput.trim()) join(joinInput.trim()); }}
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
                    className="gs-btn"
                    disabled={!joinInput.trim() || (legacy && !handle.trim())}
                  >
                    Join →
                  </button>
                </form>
              </div>
            )}

            {error && <p className="error-text">{error}</p>}
          </div>

          {/* ── Right: Resume Progress ── */}
          <div className="gs-card gs-card--ink" style={{
            padding: "28px 28px",
            background: "var(--pastel-mint)",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="gs-section-h">RESUME</div>
              {hasActiveGames && (
                <span className="gs-pill gs-pill--ink">{activeGames.length} active</span>
              )}
            </div>

            {hasActiveGames ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pagedGames.map((g) => (
                  <Link key={g.id} to={`/play/${g.id}`} style={{ textDecoration: "none" }}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        padding: "14px 16px",
                        background: "var(--bg-2)",
                        border: "2.5px solid var(--ink)",
                        borderRadius: 14,
                        transition: "transform .08s ease, box-shadow .08s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translate(-2px,-2px)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "3px 3px 0 var(--ink)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "";
                        (e.currentTarget as HTMLElement).style.boxShadow = "";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 44,
                          height: 44,
                          border: "2.5px solid var(--ink)",
                          borderRadius: 10,
                          display: "grid",
                          placeItems: "center",
                          background: "var(--pastel-cyan)",
                          fontFamily: "var(--font-display)",
                          fontWeight: 700,
                          fontSize: 13,
                          flexShrink: 0,
                        }}>
                          {g.board_size}×{g.board_size}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>
                            In progress
                          </div>
                          <div style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            color: "var(--ink-mute)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {g.id}
                          </div>
                        </div>
                      </div>
                      <div className="gs-btn gs-btn--primary" style={{ justifyContent: "center", width: "100%", boxSizing: "border-box" }}>
                        Resume →
                      </div>
                    </div>
                  </Link>
                ))}
                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <button
                      className="gs-btn"
                      disabled={resumePage === 0}
                      onClick={() => setResumePage((p) => p - 1)}
                      style={{ padding: "6px 14px", fontSize: 12 }}
                    >← Prev</button>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>
                      {resumePage + 1} / {totalPages}
                    </span>
                    <button
                      className="gs-btn"
                      disabled={resumePage >= totalPages - 1}
                      onClick={() => setResumePage((p) => p + 1)}
                      style={{ padding: "6px 14px", fontSize: 12 }}
                    >Next →</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                padding: "40px 20px",
                textAlign: "center",
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  border: "2.5px solid var(--ink)",
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: "var(--bg-2)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 26,
                }}>
                  碁
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
                  No active games
                </div>
                <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0, maxWidth: 200 }}>
                  Start a new game on the left and it will appear here.
                </p>
              </div>
            )}

            <p style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--font-display)", margin: 0 }}>
              Your games are saved automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
