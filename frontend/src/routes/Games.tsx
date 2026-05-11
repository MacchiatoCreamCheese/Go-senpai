import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getMyGames } from "../api";
import { useIdentity } from "../lib/auth";

type Status = "any" | "in_progress" | "finished";
type Size = 0 | 9 | 13 | 19;

const PAGE = 25;

const SIZE_COLOR: Record<number, string> = {
  9:  "var(--pastel-cyan)",
  13: "var(--pastel-yellow)",
  19: "var(--pastel-peach)",
};

const STATUS_LABELS: Record<Status, string> = {
  any:         "All",
  in_progress: "In progress",
  finished:    "Finished",
};

export default function Games() {
  const { userId } = useIdentity();
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
        <Link to="/lobby" className="gs-btn gs-btn--primary">Go to Lobby</Link>
      </div>
    );
  }

  return (
    <div className="games-page">
      <header className="games-head">
        <div>
          <span className="home-eyebrow">History</span>
          <h1 className="games-title">
            {filtered.length} game{filtered.length === 1 ? "" : "s"}
          </h1>
        </div>

        <div className="games-filter-bar">
          <div className="games-seg">
            {(["any", "in_progress", "finished"] as Status[]).map((s) => (
              <button
                key={s}
                type="button"
                className={"games-seg-btn" + (status === s ? " is-active" : "")}
                onClick={() => { setStatus(s); setPage(0); }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="games-seg">
            {([0, 9, 13, 19] as Size[]).map((s) => (
              <button
                key={s}
                type="button"
                className={"games-seg-btn" + (size === s ? " is-active" : "")}
                onClick={() => { setSize(s); setPage(0); }}
              >
                {s === 0 ? "Any size" : `${s}×${s}`}
              </button>
            ))}
          </div>
        </div>
      </header>

      {games.isLoading ? (
        <div className="games-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="games-empty">
          No matches.{" "}
          <Link to="/lobby" className="link-btn">Play one →</Link>
        </div>
      ) : (
        <>
          <div className="games-list">
            {pageItems.map((g) => {
              const isFinished = !!g.result;
              return (
                <Link
                  key={g.id}
                  to={isFinished ? `/games/${g.id}/review` : `/play/${g.id}`}
                  className="games-row"
                >
                  <div
                    className="games-row-color"
                    style={{ background: SIZE_COLOR[g.board_size] ?? "var(--bg-2)" }}
                  >
                    {g.board_size}×{g.board_size}
                  </div>

                  <div className="games-row-info">
                    <span className="games-row-opp">
                      {new Date(g.started_at).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </span>
                    <span className="games-row-meta">{g.id.slice(0, 8)}…</span>
                  </div>

                  <span className={"gs-pill" + (isFinished ? "" : " gs-pill--cyan")}>
                    {isFinished ? g.result : "In progress"}
                  </span>

                  <span className="games-row-action">
                    {isFinished ? "Review →" : "Resume →"}
                  </span>
                </Link>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="games-pager">
              <button
                type="button"
                className="gs-btn"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Prev
              </button>
              <span className="games-pager-label">{page + 1} / {totalPages}</span>
              <button
                type="button"
                className="gs-btn"
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
