import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getMyGames, getWeaknesses } from "../api";
import { WeaknessBar } from "../components/WeaknessBar";
import { UserChip } from "../components/UserChip";

const USER_ID_KEY = "senpai_user_id";
const HANDLE_KEY = "senpai_user_handle";

type TabId = "weaknesses" | "games" | "concepts" | "progress";

export default function Profile() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const meId = localStorage.getItem(USER_ID_KEY);
  const meHandle = localStorage.getItem(HANDLE_KEY) ?? "Guest";
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
          <div className="home-empty">
            Concepts learned will appear here once <code>/users/:id/concepts</code> is wired
            up on the backend.
          </div>
        )}

        {tab === "progress" && (
          <div className="home-empty">
            Rank-over-time and drills-per-week charts arrive with{" "}
            <code>/users/:id/progress</code>.
          </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="home-stat">
      <span className="home-stat-value">{value}</span>
      <span className="home-stat-label">{label}</span>
    </div>
  );
}
