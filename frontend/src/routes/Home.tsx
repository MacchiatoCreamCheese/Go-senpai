import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  getMyGames,
  getNextAction,
  getUserConcepts,
  getUserProgress,
  getWeaknesses,
  updateMyHandle,
  type NextActionResponse,
  type UserGameListItem,
  type WeaknessItem,
} from "../api";
import { AuthLoading } from "../components/AuthLoading";
import { WeaknessBar } from "../components/WeaknessBar";
import { useToast } from "../components/NotificationToast";
import { SETUP_DONE_KEY, useAuth, useIdentity } from "../lib/auth";
import { GoBoardSVG } from "../GoBoardSVG";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function Home() {
  const { profile, user, ready, refreshProfile } = useAuth();
  const { userId, displayName: handle } = useIdentity();
  const toast = useToast();

  const [nameConfirmed, setNameConfirmed] = useState(false);

  useEffect(() => {
    if (userId) {
      setNameConfirmed(!!localStorage.getItem(`${SETUP_DONE_KEY}_${userId}`));
    }
  }, [userId]);

  const games = useQuery({
    queryKey: ["my-games", userId],
    queryFn: () => (userId ? getMyGames(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const weaknesses = useQuery({
    queryKey: ["weaknesses", userId],
    queryFn: () => (userId ? getWeaknesses(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const userConcepts = useQuery({
    queryKey: ["user-concepts", userId],
    queryFn: () => (userId ? getUserConcepts(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const progress = useQuery({
    queryKey: ["user-progress", userId],
    queryFn: () =>
      userId
        ? getUserProgress(userId)
        : Promise.resolve({ games_per_week: [], drills_per_week: [], top_weakness_severity_history: [] }),
    enabled: !!userId,
  });

  const nextAction = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Sign in first");
      return getNextAction(userId);
    },
    onError: (err) =>
      toast.push({ kind: "error", title: "Couldn't ask Sensei", body: String(err) }),
  });

  const action: NextActionResponse | null = nextAction.data ?? null;

  const recent = (games.data ?? []).slice(0, 5);
  const topWeaknesses = (weaknesses.data ?? [])
    .slice()
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 6);

  const stats = useMemo(() => {
    const all = games.data ?? [];
    const finished = all.filter((g) => g.result);
    const drillsThisWeek = (progress.data?.drills_per_week ?? []).slice(-1)[0]?.value ?? 0;
    return {
      played: all.length,
      finished: finished.length,
      drills: Math.round(drillsThisWeek),
      concepts: (userConcepts.data ?? []).length,
    };
  }, [games.data, progress.data, userConcepts.data]);

  if (!ready) return <AuthLoading />;

  const isLoggedIn = !!(userId || user?.id);
  if (!isLoggedIn) return <WelcomeStub />;

  if (!nameConfirmed) {
    return (
      <NameSetupScreen
        email={profile?.email ?? user?.email ?? null}
        defaultHandle={profile?.handle ?? ""}
        onConfirm={async (chosenName) => {
          const current = profile?.handle ?? "";
          if (chosenName.trim() && chosenName.trim() !== current) {
            await updateMyHandle(chosenName.trim());
            await refreshProfile();
          }
          if (userId) localStorage.setItem(`${SETUP_DONE_KEY}_${userId}`, "1");
          setNameConfirmed(true);
        }}
      />
    );
  }

  const activeGames = (games.data ?? []).filter((g) => !g.result);

  return (
    <div className="home-page">
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, maxWidth: 1240, width: "100%", margin: "0 auto" }}>
        {/* HERO — Sensei card */}
        <SenseiHero
          action={action}
          handle={handle}
          isPending={nextAction.isPending}
          onAsk={() => nextAction.mutate()}
          activeGame={activeGames[0] ?? null}
        />

        {/* Stats + streak column */}
        <div style={{ display: "grid", gap: 16 }}>
          <StatBlock stats={stats} />
          <StreakBlock />
        </div>

        {/* Quick play row — full width */}
        <div style={{ gridColumn: "1 / -1" }}>
          <QuickPlayRow hasActiveGame={activeGames.length > 0} activeGameId={activeGames[0]?.id ?? null} />
        </div>

        {/* Recent games */}
        <RecentGames games={recent} isLoading={games.isLoading} />

        {/* Weakness panel */}
        <WeaknessPanel weaknesses={topWeaknesses} isLoading={weaknesses.isLoading} />
      </div>
    </div>
  );
}

// ─── Sensei hero ───────────────────────────────────────────────

function SenseiHero({
  action,
  handle,
  isPending,
  onAsk,
  activeGame,
}: {
  action: NextActionResponse | null;
  handle: string;
  isPending: boolean;
  onAsk: () => void;
  activeGame: UserGameListItem | null;
}) {
  const navigate = useNavigate();

  const kindLabel = action
    ? { review_game: "Review a game", serve_drill: "Time for a drill", teach_concept: "New concept", revisit_concept: "Revisit concept", idle: "All caught up!" }[action.kind] ?? "Next step"
    : null;

  const title = action
    ? kindLabel ?? "Here's your next step."
    : `Welcome back, ${handle || "player"}.`;

  const body = action
    ? (action.reason ?? "Your Sensei has prepared a recommendation based on your recent activity.")
    : "Ask Sensei what to do — the planner looks at your weaknesses, unreviewed games, and concepts you've been meaning to revisit.";

  return (
    <div className="gs-card" style={{
      position: "relative",
      padding: "22px 24px",
      background: "var(--pastel-cyan)",
      overflow: "hidden",
      minHeight: 250,
      display: "grid",
      gridTemplateColumns: "1fr 180px",
      gap: 18,
      alignItems: "center",
    }}>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {action && (
            <span className="gs-tag" style={{ background: "var(--bg-2)" }}>
              {action.kind?.replace(/_/g, " ").toUpperCase() ?? "NEXT ACTION"}
            </span>
          )}
          <span className="gs-sticker">先生 · TODAY'S PICK</span>
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1.06,
          letterSpacing: "-0.025em",
          margin: "14px 0 6px",
        }}>
          {title}
        </h1>

        <p style={{ margin: "0 0 14px", color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.5 }}>
          {body}
        </p>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {action ? (
            <>
              {action.game_id && (
                <button className="gs-btn gs-btn--primary"
                  onClick={() => navigate(`/games/${action.game_id}/review`)}>
                  Open review →
                </button>
              )}
              {action.problem?.id && (
                <button className="gs-btn gs-btn--cyan"
                  onClick={() => navigate(`/drill/${action.problem!.id}`)}>
                  Start drill →
                </button>
              )}
              <button className="gs-btn" onClick={onAsk} disabled={isPending}>
                {isPending ? "Asking…" : "New suggestion"}
              </button>
            </>
          ) : (
            <>
              <button className="gs-btn gs-btn--primary" onClick={onAsk} disabled={isPending}>
                {isPending ? "Asking Sensei…" : "What should I do next?"}
              </button>
              {activeGame && (
                <button className="gs-btn gs-btn--cyan"
                  onClick={() => navigate(`/play/${activeGame.id}`)}>
                  Resume game →
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mini board */}
      <div style={{ transform: "rotate(-4deg)", justifySelf: "center" }}>
        <div className="panel panel--ink" style={{
          padding: 6,
          background: "var(--bg-2)",
          boxShadow: "var(--shadow-block-sm)",
        }}>
          <GoBoardSVG size={9} width={170} stones={[
            { x: 4, y: 4, c: "b" }, { x: 4, y: 2, c: "w" },
            { x: 2, y: 4, c: "b" }, { x: 6, y: 4, c: "w" },
            { x: 4, y: 6, c: "b", tier: "bad" },
            { x: 6, y: 6, c: "w" }, { x: 2, y: 2, c: "b" },
            { x: 6, y: 2, c: "w" }, { x: 5, y: 5, c: "b" },
          ]} />
        </div>
      </div>
    </div>
  );
}

// ─── Stat block ────────────────────────────────────────────────

function StatBlock({ stats }: { stats: { played: number; finished: number; drills: number; concepts: number } }) {
  return (
    <div className="gs-card" style={{ padding: "18px 20px", background: "var(--pastel-yellow)" }}>
      <div className="gs-tag">THIS WEEK</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        {[
          { v: stats.played, l: "Games played" },
          { v: stats.finished, l: "Finished" },
          { v: stats.drills, l: "Drills done" },
          { v: stats.concepts, l: "Concepts" },
        ].map(({ v, l }) => (
          <div key={l}>
            <div className="gs-display-700" style={{ fontSize: 28, lineHeight: 1 }}>{v}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-soft)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {l}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Streak block ──────────────────────────────────────────────

function StreakBlock() {
  const today = new Date().getDay();
  const filled = DAYS.map((_, i) => i < ((today + 6) % 7));

  return (
    <div className="gs-card" style={{ padding: "18px 20px", background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="gs-tag">DRILL STREAK</div>
        <span className="gs-display-700" style={{ fontSize: 20 }}>Keep it up!</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14, justifyContent: "space-between" }}>
        {DAYS.map((d, i) => (
          <div key={i} style={{
            flex: 1,
            height: 46,
            borderRadius: 10,
            border: "2px solid var(--ink)",
            background: filled[i] ? "var(--pastel-green)" : "var(--bg)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
          }}>
            <span style={{ fontSize: 11, opacity: 0.8 }}>{d}</span>
            <span style={{ fontSize: 10 }}>{filled[i] ? "✓" : "·"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent games ──────────────────────────────────────────────

function RecentGames({ games, isLoading }: { games: UserGameListItem[]; isLoading: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="gs-card" style={{ padding: 20, background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="gs-section-h">RECENT GAMES</div>
        <Link to="/games" className="gs-btn" style={{ padding: "6px 14px", fontSize: 12, textDecoration: "none" }}>
          see all →
        </Link>
      </div>

      {isLoading ? (
        <div style={{ padding: "20px 0", color: "var(--ink-mute)", fontFamily: "var(--font-display)", fontSize: 14 }}>
          Loading…
        </div>
      ) : games.length === 0 ? (
        <div style={{ padding: "20px 0", color: "var(--ink-mute)", fontFamily: "var(--font-display)", fontSize: 14 }}>
          No games yet — <Link to="/lobby" style={{ color: "var(--ink)", fontWeight: 700 }}>play one →</Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {games.map((g) => {
            const isActive = !g.result;
            return (
              <div key={g.id} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto auto",
                gap: 14,
                alignItems: "center",
                padding: "10px 14px",
                border: "2px solid var(--ink)",
                borderRadius: 12,
                background: isActive ? "var(--pastel-pink)" : "var(--bg)",
                cursor: "pointer",
              }}
                onClick={() => navigate(isActive ? `/play/${g.id}` : `/games/${g.id}/review`)}
              >
                <div style={{
                  width: 44,
                  height: 44,
                  border: "2px solid var(--ink)",
                  borderRadius: 8,
                  display: "grid",
                  placeItems: "center",
                  background: "var(--bg-2)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 14,
                }}>
                  {g.board_size}×{g.board_size}
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>
                    {isActive ? "In progress" : g.result ?? "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
                    {new Date(g.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
                <span className={`gs-pill ${isActive ? "gs-pill--pink" : g.result?.startsWith("B+") || g.result?.startsWith("W+") ? "gs-pill--mint" : "gs-pill--red"}`}>
                  {isActive ? "live" : g.result ? "done" : "—"}
                </span>
                <button className={`gs-btn ${isActive ? "gs-btn--primary" : ""}`}
                  style={{ padding: "6px 14px", fontSize: 12 }}>
                  {isActive ? "play" : "review"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Weakness panel ────────────────────────────────────────────

function WeaknessPanel({ weaknesses, isLoading }: { weaknesses: WeaknessItem[]; isLoading: boolean }) {
  return (
    <div className="gs-card" style={{ padding: 20, background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="gs-section-h">WEAKNESSES · 弱点</div>
        <span className="gs-pill gs-pill--cyan">EMA · last 30d</span>
      </div>

      {isLoading ? (
        <div style={{ color: "var(--ink-mute)", fontFamily: "var(--font-display)", fontSize: 14 }}>Loading…</div>
      ) : weaknesses.length === 0 ? (
        <div style={{ color: "var(--ink-mute)", fontFamily: "var(--font-display)", fontSize: 14 }}>
          No weaknesses tracked yet. Finish training games (with KataGo running) or run full game
          analysis — insights appear from your move stats, not from the LLM review.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {weaknesses.map((w) => (
            <WeaknessBar key={w.theme} weakness={w} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quick play row ────────────────────────────────────────────

const QUICK_CARDS = [
  { title: "Quick AI Game", sub: "9×9 training mode", color: "var(--pastel-cyan)", tag: "FAST", emoji: "▶", to: "/lobby" },
  { title: "Find a human", sub: "Live lobby", color: "var(--pastel-pink)", tag: "PvP", emoji: "👥", to: "/lobby" },
  { title: "Tsumego drill", sub: "Sharpen your reading", color: "var(--pastel-yellow)", tag: "DRILL", emoji: "◇", to: "/drill" },
  { title: "Review games", sub: "KataGo analysis", color: "var(--pastel-green)", tag: "REVIEW", emoji: "↻", to: "/games" },
];

function QuickPlayRow({ hasActiveGame, activeGameId }: { hasActiveGame: boolean; activeGameId: string | null }) {
  const navigate = useNavigate();
  const cards = hasActiveGame && activeGameId
    ? [
        { title: "Resume game", sub: "Your move is waiting", color: "var(--pastel-green)", tag: "LIVE", emoji: "↻", to: `/play/${activeGameId}` },
        ...QUICK_CARDS.slice(1),
      ]
    : QUICK_CARDS;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      {cards.map((c, i) => (
        <button key={i} className="gs-card" style={{
          padding: "16px 18px",
          textAlign: "left",
          background: c.color,
          cursor: "pointer",
          border: "3px solid var(--border)",
          fontFamily: "var(--font-body)",
          color: "var(--ink)",
          transition: "transform .1s, box-shadow .1s",
        }}
          onClick={() => navigate(c.to)}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translate(-2px,-2px)";
            e.currentTarget.style.boxShadow = "var(--shadow-block-sm)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "";
            e.currentTarget.style.boxShadow = "";
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="gs-tag">{c.tag}</span>
            <span style={{ fontSize: 22 }}>{c.emoji}</span>
          </div>
          <div className="gs-display-700" style={{ fontSize: 20, marginTop: 14, lineHeight: 1.05 }}>
            {c.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>{c.sub}</div>
        </button>
      ))}
    </div>
  );
}

// ─── Welcome stub (not logged in) ─────────────────────────────

function WelcomeStub() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      padding: 40,
    }}>
      <div className="panel panel--ink" style={{
        padding: "36px 44px",
        background: "var(--pastel-cyan)",
        maxWidth: 460,
        textAlign: "center",
        boxShadow: "var(--shadow-block)",
      }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 72, lineHeight: 1, marginBottom: 16 }}>
          先
        </div>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Welcome to Go-senpai.</h1>
        <p style={{ fontSize: 14, marginBottom: 24, color: "var(--ink-soft)" }}>
          Your AI-powered Go coach. Track games, drill problems, and learn concepts — all in one place.
        </p>
        <Link to="/login" className="gs-btn gs-btn--primary" style={{ textDecoration: "none" }}>
          Sign In →
        </Link>
      </div>
    </div>
  );
}

// ─── Name-setup screen (logged in, first time) ─────────────────

function NameSetupScreen({
  email,
  defaultHandle,
  onConfirm,
}: {
  email: string | null;
  defaultHandle: string;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(defaultHandle);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "70vh",
      padding: "40px 20px",
    }}>
      <div style={{
        display: "flex",
        gap: 20,
        width: "100%",
        maxWidth: 860,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}>
        {/* Main card */}
        <div className="panel panel--ink" style={{
          flex: "1 1 360px",
          padding: "32px 36px",
          background: "var(--pastel-cyan)",
          boxShadow: "var(--shadow-block)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}>
          <span className="gs-sticker">WELCOME</span>

          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, lineHeight: 1.1, marginBottom: 8 }}>
              What should we call you?
            </h1>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55 }}>
              Signed in as <strong>{email ?? "your account"}</strong>. Add a display name — or skip and jump straight in.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="login-label" htmlFor="display-name">Display name <span style={{ fontWeight: 400, color: "var(--ink-mute)" }}>(optional)</span></label>
            <input
              id="display-name"
              className="input"
              type="text"
              placeholder={defaultHandle || "Your name or nickname"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onConfirm(name || defaultHandle); }}
              autoFocus
            />
            {defaultHandle && (
              <p style={{ fontSize: 12, color: "var(--ink-mute)", margin: 0 }}>
                Your auto-generated name: <strong>{defaultHandle}</strong>
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="gs-btn gs-btn--primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => onConfirm(name || defaultHandle)}
            >
              Get Started →
            </button>
            {defaultHandle && (
              <button
                className="gs-btn"
                style={{ width: "100%", justifyContent: "center", background: "transparent", fontSize: 13 }}
                onClick={() => onConfirm(defaultHandle)}
              >
                Skip, keep "{defaultHandle}"
              </button>
            )}
          </div>
        </div>

        {/* Feature highlights */}
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { color: "var(--pastel-yellow)", tag: "AI COACH", title: "Sensei knows your game", body: "Get next-move hints and post-game reviews powered by KataGo." },
            { color: "var(--pastel-green)",  tag: "DRILL",    title: "Tsumego every day",     body: "Sharpen your reading with life-and-death problems." },
            { color: "var(--pastel-lavender)", tag: "LEARN",  title: "Concept library",       body: "Study joseki, fuseki, and key Go ideas at your own pace." },
          ].map((f) => (
            <div key={f.tag} className="panel panel--ink" style={{
              padding: "16px 20px",
              background: f.color,
              boxShadow: "var(--shadow-block-sm)",
            }}>
              <span className="gs-tag" style={{ marginBottom: 8, display: "inline-block" }}>{f.tag}</span>
              <div className="gs-display-700" style={{ fontSize: 16, marginBottom: 4 }}>{f.title}</div>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
