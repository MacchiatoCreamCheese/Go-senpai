import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { listConcepts } from "../api";

export default function Concepts() {
  const [tag, setTag] = useState<string | null>(null);
  const concepts = useQuery({
    queryKey: ["concepts"],
    queryFn: () => listConcepts(),
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const c of concepts.data ?? []) for (const t of c.tags) s.add(t);
    return Array.from(s).sort();
  }, [concepts.data]);

  const items = (concepts.data ?? []).filter((c) =>
    !tag ? true : c.tags.includes(tag),
  );

  return (
    <div className="concepts-page">
      <header className="concepts-head">
        <span className="home-eyebrow">Library</span>
        <h1 className="concepts-title">Go concepts</h1>
        <p className="concepts-sub">
          A growing collection of named ideas Sensei pulls from when reviewing your games.
        </p>
      </header>

      <div className="concepts-layout">
        <aside className="concepts-tags">
          <button
            type="button"
            className={"concepts-tag" + (tag === null ? " is-active" : "")}
            onClick={() => setTag(null)}
          >
            All
          </button>
          {allTags.map((t) => (
            <button
              type="button"
              key={t}
              className={"concepts-tag" + (tag === t ? " is-active" : "")}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          ))}
        </aside>

        <section className="concepts-grid">
          {concepts.isLoading ? (
            <div className="home-empty">Loading…</div>
          ) : items.length === 0 ? (
            <div className="home-empty">No concepts under this tag.</div>
          ) : (
            items.map((c) => (
              <Link key={c.id} to={`/concepts/${c.id}`} className="concept-card">
                <span className="concept-card-title">{c.title}</span>
                {c.tags.length > 0 && (
                  <span className="concept-card-tags">{c.tags.slice(0, 3).join(" · ")}</span>
                )}
              </Link>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
