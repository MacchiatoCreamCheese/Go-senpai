import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getMyGames } from "../api";

const USER_ID_KEY = "senpai_user_id";

type Status = "any" | "in_progress" | "finished";
type Size = 0 | 9 | 13 | 19;

const PAGE = 25;

export default function Games() {
  const userId = localStorage.getItem(USER_ID_KEY);
  const [status, setStatus] = useState<Status>("any");
  const [size, setSize] = useState<Size>(0);
  const [page, setPage] = useState(0);

  const games = useQuery({
    queryKey: ["my-games", userId],
    queryFn: () => (userId ? getMyGames(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const filtered = useMemo(() => {
    return (games.data ?? []).filter((g) => {
      if (status === "in_progress" && g.result) return false;
      if (status === "finished" && !g.result) return false;
      if (size !== 0 && g.board_size !== size) return false;
      return true;
    });
  }, [games.data, status, size]);

  const pageItems = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));

  if (!userId) {
    return (
      <div className="stub-page">
        <div className="stub-mark">史</div>
        <h1>Game history</h1>
        <p>Set a name in the Lobby first.</p>
        <Link to="/lobby" className="btn btn-primary">Go to Lobby</Link>
      </div>
    );
  }

  return (
    <div className="games-page">
      <header className="games-head">
        <div>
          <span className="home-eyebrow">Your games</span>
          <h1 className="games-title">{filtered.length} game{filtered.length === 1 ? "" : "s"}</h1>
        </div>
        <div className="games-filters">
          <select
            className="styled-select"
            value={status}
            onChange={(e) => { setStatus(e.target.value as Status); setPage(0); }}
          >
            <option value="any">Any status</option>
            <option value="in_progress">In progress</option>
            <option value="finished">Finished</option>
          </select>
          <select
            className="styled-select"
            value={size}
            onChange={(e) => { setSize(parseInt(e.target.value, 10) as Size); setPage(0); }}
          >
            <option value="0">Any size</option>
            <option value="9">9×9</option>
            <option value="13">13×13</option>
            <option value="19">19×19</option>
          </select>
        </div>
      </header>

      {games.isLoading ? (
        <div className="home-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="home-empty">
          No matches. <Link to="/lobby" className="link-btn">Play one →</Link>
        </div>
      ) : (
        <>
          <table className="games-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Size</th>
                <th>Result</th>
                <th>ID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((g) => (
                <tr key={g.id}>
                  <td>
                    {new Date(g.started_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </td>
                  <td className="mono">{g.board_size}×{g.board_size}</td>
                  <td>{g.result ?? <span className="dim">in progress</span>}</td>
                  <td className="mono dim">{g.id.slice(0, 8)}…</td>
                  <td className="r">
                    <Link to={g.result ? `/games/${g.id}` : `/play/${g.id}`} className="link-btn">
                      {g.result ? "Review →" : "Resume →"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="games-pager">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Prev
              </button>
              <span className="dim">Page {page + 1} of {totalPages}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
