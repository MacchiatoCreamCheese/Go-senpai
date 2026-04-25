import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  getMyGames,
  getNextAction,
  getWeaknesses,
  type NextActionResponse,
} from "../api";
import { ActionCard } from "../components/ActionCard";
import { WeaknessBar } from "../components/WeaknessBar";
import { useToast } from "../components/NotificationToast";
import { useIdentity } from "../lib/auth";

export default function Home() {
  const { userId, displayName: handle } = useIdentity();
  const toast = useToast();

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
    .slice(0, 3);

  const stats = useMemo(() => {
    const all = games.data ?? [];
    const finished = all.filter((g) => g.result);
    const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentFinished = finished.filter((g) => Date.parse(g.started_at) >= week);
    return {
      played: all.length,
      finished: finished.length,
      thisWeek: recentFinished.length,
    };
  }, [games.data]);

  if (!userId) {
    return (
      <div className="home-stub">
        <div className="home-mark" aria-hidden="true">先</div>
        <h1>Welcome to Go-senpai.</h1>
        <p className="home-tagline">
          Set a name in the Lobby to start playing — your dashboard will fill in as you do.
        </p>
        <div className="home-cta-row">
          <Link to="/lobby" className="btn btn-primary">Go to Lobby</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <header className="home-page-head">
        <div>
          <span className="home-eyebrow">Welcome back</span>
          <h1 className="home-title">{handle}</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => nextAction.mutate()}
          disabled={nextAction.isPending}
        >
          {nextAction.isPending ? "Asking Sensei…" : action ? "Get a new action" : "What should I do next?"}
        </button>
      </header>

      {action ? (
        <ActionCard action={action} eyebrow="Sensei suggests" />
      ) : (
        <div className="home-hero-empty">
          <p>
            Ask Sensei what to do next — the planner looks at your weaknesses, the games you
            haven't reviewed, and the concepts you've been meaning to revisit.
          </p>
        </div>
      )}

      <div className="home-grid">
        <section className="home-col">
          <h3 className="home-col-title">Recent games</h3>
          {games.isLoading ? (
            <div className="home-empty">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="home-empty">No games yet. <Link to="/lobby" className="link-btn">Play one →</Link></div>
          ) : (
            <ul className="home-game-list">
              {recent.map((g) => (
                <li key={g.id}>
                  <Link to={`/games/${g.id}`} className="home-game-row">
                    <span className="home-game-size">{g.board_size}×{g.board_size}</span>
                    <span className="home-game-result">
                      {g.result ?? <span className="dim">in progress</span>}
                    </span>
                    <span className="home-game-date">
                      {new Date(g.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/games" className="home-col-foot">View all →</Link>
        </section>

        <section className="home-col">
          <h3 className="home-col-title">Top weaknesses</h3>
          {weaknesses.isLoading ? (
            <div className="home-empty">Loading…</div>
          ) : topWeaknesses.length === 0 ? (
            <div className="home-empty">
              Nothing flagged yet. After your first reviewed game, themes show up here.
            </div>
          ) : (
            <div className="home-weakness-stack">
              {topWeaknesses.map((w) => (
                <WeaknessBar key={w.theme} weakness={w} />
              ))}
            </div>
          )}
          <Link to="/profile" className="home-col-foot">Full profile →</Link>
        </section>

        <section className="home-col">
          <h3 className="home-col-title">This week</h3>
          <div className="home-stat-stack">
            <Stat label="Games played" value={stats.played.toString()} />
            <Stat label="Games finished" value={stats.finished.toString()} />
            <Stat label="Played in last 7d" value={stats.thisWeek.toString()} />
          </div>
          <span className="home-col-foot dim">
            Drill + concept counts arrive once those endpoints exist.
          </span>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="home-stat">
      <span className="home-stat-value">{value}</span>
      <span className="home-stat-label">{label}</span>
    </div>
  );
}
