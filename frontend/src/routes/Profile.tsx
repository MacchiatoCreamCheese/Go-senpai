import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getMyGames, getUserConcepts, getUserProgress, getWeaknesses } from "../api";
import { Sparkline } from "../components/Sparkline";
import { WeaknessBar } from "../components/WeaknessBar";
import { UserChip } from "../components/UserChip";
import { HandleEditor } from "../components/HandleEditor";
import { useAuth, useIdentity } from "../lib/auth";

type TabId = "weaknesses" | "games" | "concepts" | "progress";

export default function Profile() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const { profile, legacy } = useAuth();
  const { userId: meId, displayName: meHandle } = useIdentity();
  const userId = paramId ?? meId;
  const isMe = !paramId || paramId === meId;
  const [tab, setTab] = useState<TabId>("weaknesses");

  const weaknesses = useQuery({
    queryKey: ["weaknesses", userId],
    queryFn: () => (userId ? getWeaknesses(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const games = useQuery({
    queryKey: ["my-games", userId],
    queryFn: () => (userId ? getMyGames(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const concepts = useQuery({
    queryKey: ["user-concepts", userId],
    queryFn: () => (userId ? getUserConcepts(userId) : Promise.resolve([])),
    enabled: !!userId && tab === "concepts",
  });

  const progress = useQuery({
    queryKey: ["user-progress", userId],
    queryFn: () =>
      userId
        ? getUserProgress(userId)
        : Promise.resolve({ games_per_week: [], drills_per_week: [], top_weakness_severity_history: [] }),
    enabled: !!userId && tab === "progress",
  });

  if (!userId) {
    return (
      <div className="stub-page">
        <div className="stub-mark">己</div>
        <h1>Profile</h1>
        <p>Set a name in the Lobby first.</p>
        <Link to="/lobby" className="btn btn-primary">Go to Lobby</Link>
      </div>
    );
  }

  const sortedWeaknesses = (weaknesses.data ?? [])
    .slice()
    .sort((a, b) => b.severity - a.severity);

  return (
    <div className="profile-page">
      <header className="profile-head">
        <div className="profile-head-id">
          <UserChip userId={userId} handle={isMe ? meHandle : undefined} />
          {isMe && !legacy && profile && (
            <div style={{ marginTop: 14, maxWidth: 320 }}>
              <HandleEditor />
            </div>
          )}
        </div>
        <div className="profile-head-stats">
          <Stat label="Games" value={(games.data ?? []).length.toString()} />
          <Stat
            label="Finished"
            value={(games.data ?? []).filter((g) => g.result).length.toString()}
          />
          <Stat label="Weaknesses tracked" value={(weaknesses.data ?? []).length.toString()} />
        </div>
      </header>

      <nav className="profile-tabs" role="tablist">
        <ProfileTab id="weaknesses" label="Weaknesses" active={tab} onSelect={setTab} />
        <ProfileTab id="games" label="Game history" active={tab} onSelect={setTab} />
        <ProfileTab id="concepts" label="Concepts" active={tab} onSelect={setTab} />
        <ProfileTab id="progress" label="Progress" active={tab} onSelect={setTab} />
      </nav>

      <section className="profile-body">
        {tab === "weaknesses" && (
          <>
            {weaknesses.isLoading ? (
              <div className="home-empty">Loading…</div>
            ) : sortedWeaknesses.length === 0 ? (
              <div className="home-empty">
                Nothing flagged yet. After a reviewed game, themes will appear here ranked by severity.
              </div>
            ) : (
              <div className="profile-weakness-stack">
                {sortedWeaknesses.map((w) => (
                  <WeaknessBar key={w.theme} weakness={w} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "games" && (
          <>
            {games.isLoading ? (
              <div className="home-empty">Loading…</div>
            ) : (games.data ?? []).length === 0 ? (
              <div className="home-empty">
                No games yet. <Link to="/lobby" className="link-btn">Play one →</Link>
              </div>
            ) : (
              <ul className="home-game-list profile-game-list">
                {(games.data ?? []).map((g) => (
                  <li key={g.id}>
                    <Link to={`/games/${g.id}`} className="home-game-row">
                      <span className="home-game-size">{g.board_size}×{g.board_size}</span>
                      <span className="home-game-result">
                        {g.result ?? <span className="dim">in progress</span>}
                      </span>
                      <span className="home-game-date">
                        {new Date(g.started_at).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", year: "numeric",
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "concepts" && (
          <>
            {concepts.isLoading ? (
              <div className="home-empty">Loading…</div>
            ) : (concepts.data ?? []).length === 0 ? (
              <div className="home-empty">
                No concepts taught yet. Ask Sensei <Link to="/coach" className="link-btn">for a lesson →</Link>
              </div>
            ) : (
              <div className="profile-concept-grid">
                {(concepts.data ?? []).map((c) => (
                  <Link
                    key={c.concept_id}
                    to={`/concepts/${c.concept_id}`}
                    className={"profile-concept-card" + (c.demonstrated ? " is-demo" : "")}
                  >
                    <span className="profile-concept-title">{c.title}</span>
                    <span className="profile-concept-meta">
                      <span>taught {c.times_taught}×</span>
                      {c.demonstrated && <span className="dim">· demonstrated</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "progress" && (
          <>
            {progress.isLoading ? (
              <div className="home-empty">Loading…</div>
            ) : (
              <div className="profile-progress-stack">
                <ProgressRow
                  label="Games per week"
                  data={progress.data?.games_per_week ?? []}
                />
                <ProgressRow
                  label="Drills per week"
                  data={progress.data?.drills_per_week ?? []}
                />
                <ProgressRow
                  label="Top weakness severity"
                  data={progress.data?.top_weakness_severity_history ?? []}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ProfileTab({
  id, label, active, onSelect,
}: { id: TabId; label: string; active: TabId; onSelect: (t: TabId) => void }) {
  return (
    <button
      role="tab"
      aria-selected={active === id}
      className={"viewer-tab" + (active === id ? " is-active" : "")}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}

function ProgressRow({ label, data }: { label: string; data: { week: string; value: number }[] }) {
  const latest = data.length > 0 ? data[data.length - 1].value : 0;
  return (
    <div className="profile-progress-row">
      <div className="profile-progress-meta">
        <span className="profile-progress-label">{label}</span>
        <span className="profile-progress-latest">{latest.toFixed(latest % 1 === 0 ? 0 : 2)}</span>
      </div>
      <Sparkline points={data.map((d) => d.value)} width={260} height={36} />
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
