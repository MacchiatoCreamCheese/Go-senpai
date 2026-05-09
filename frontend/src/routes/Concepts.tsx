import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listConcepts, type ConceptListItem } from "../api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TAG_ACCENT: Record<string, string> = {
  tactics:    "var(--pastel-pink)",
  capture:    "var(--pastel-peach)",
  reading:    "var(--pastel-lavender)",
  shape:      "var(--pastel-cyan)",
  bad_shape:  "var(--pastel-blue)",
  local:      "var(--pastel-green)",
  strategy:   "var(--pastel-yellow)",
  opening:    "var(--pastel-mint)",
  endgame:    "var(--pastel-peach)",
  life:       "var(--pastel-green)",
  tesuji:     "var(--pastel-pink)",
  territory:  "var(--pastel-cyan)",
  ko:         "var(--pastel-lavender)",
  positional: "var(--pastel-yellow)",
};

function cardAccent(tags: string[]): string {
  for (const t of tags) if (TAG_ACCENT[t]) return TAG_ACCENT[t];
  return "var(--border)";
}

function deriveDifficulty(tags: string[]): { label: string; bg: string } {
  if (tags.some(t => ["ko", "reading", "strategy", "endgame", "positional", "sabaki"].includes(t)))
    return { label: "Advanced", bg: "var(--pastel-lavender)" };
  if (tags.some(t => ["life", "fundamentals", "basic", "two_eye"].includes(t)))
    return { label: "Beginner", bg: "var(--pastel-green)" };
  return { label: "Intermediate", bg: "var(--pastel-yellow)" };
}

function fmtTag(t: string) { return t.replace(/_/g, " "); }

function matchesConcept(c: ConceptListItem, q: string): boolean {
  const lq = q.toLowerCase();
  return (
    c.title.toLowerCase().includes(lq) ||
    (c.summary ?? "").toLowerCase().includes(lq) ||
    c.tags.some(t => t.replace(/_/g, " ").includes(lq))
  );
}

// ─── Search icon ──────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

// ─── Tag filter dropdown (portal-rendered) ────────────────────────────────────

function TagFilterDropdown({
  tagCounts,
  activeTags,
  onToggle,
  onClearAll,
}: {
  tagCounts: [string, number][];
  activeTags: Set<string>;
  onToggle: (tag: string) => void;
  onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState({ top: 0, right: 0 });

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        popRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasActive = activeTags.size > 0;

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        className={`filter-btn${hasActive ? " is-active" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>Tags</span>
        {hasActive && <span className="filter-btn-badge">{activeTags.size}</span>}
        <span
          className="filter-btn-caret"
          style={{ display: "inline-block", transition: "transform 150ms", transform: open ? "rotate(180deg)" : "none" }}
        >
          ▾
        </span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="filter-popover"
          style={{ top: popPos.top, right: popPos.right }}
          role="listbox"
          aria-multiselectable="true"
        >
          <div className="filter-popover-head">
            <span className="filter-popover-title">Filter by tag</span>
            {hasActive && (
              <button
                className="filter-popover-clear"
                onClick={() => { onClearAll(); setOpen(false); }}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="filter-popover-chips">
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                role="option"
                aria-selected={activeTags.has(tag)}
                className={`filter-chip${activeTags.has(tag) ? " is-active" : ""}`}
                onClick={() => onToggle(tag)}
              >
                {fmtTag(tag)}
                <span className="filter-chip-count">{count}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Concept card ─────────────────────────────────────────────────────────────

function ConceptCard({
  concept,
  index,
  bookmarked,
  onBookmark,
}: {
  concept: ConceptListItem;
  index: number;
  bookmarked: boolean;
  onBookmark: (id: string) => void;
}) {
  const accent = cardAccent(concept.tags);
  const diff = deriveDifficulty(concept.tags);
  const [primary, ...rest] = concept.tags;

  return (
    <Link
      to={`/concepts/${concept.id}`}
      className="concept-card"
      style={{ animationDelay: `${Math.min(index * 35, 350)}ms` }}
    >
      <div className="concept-card-strip" style={{ background: accent }} />
      <div className="concept-card-inner">
        <div className="concept-card-eyebrow">
          {primary ? (
            <span
              className="gs-tag"
              style={{ background: accent, textTransform: "capitalize", fontSize: 9.5 }}
            >
              {fmtTag(primary)}
            </span>
          ) : <span />}
          <span className="concept-difficulty" style={{ background: diff.bg }}>
            {diff.label}
          </span>
        </div>

        <div className="concept-card-title">{concept.title}</div>

        {concept.summary && (
          <p className="concept-card-excerpt">{concept.summary}</p>
        )}

        <div className="concept-card-footer">
          <div className="concept-card-chips">
            {rest.slice(0, 2).map(t => (
              <span key={t} className="gs-pill" style={{ fontSize: 10, padding: "2px 8px" }}>
                {fmtTag(t)}
              </span>
            ))}
          </div>
          <button
            className={`concept-bookmark${bookmarked ? " is-saved" : ""}`}
            onClick={e => { e.preventDefault(); onBookmark(concept.id); }}
            title={bookmarked ? "Remove bookmark" : "Bookmark"}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this concept"}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
      </div>
    </Link>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasFilter, onClear }: { hasFilter: boolean; onClear: () => void }) {
  return (
    <div className="library-empty">
      <div className="library-empty-glyph">智</div>
      <div className="library-empty-title">
        {hasFilter ? "No matching concepts" : "No concepts yet"}
      </div>
      <p className="library-empty-sub">
        {hasFilter
          ? "Try a different search term or clear the active filters."
          : "Run the concept loader to seed the corpus first."}
      </p>
      {hasFilter && (
        <button className="gs-btn" style={{ marginTop: 8 }} onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Concepts() {
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("senpai_concept_bookmarks");
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });

  const { data: concepts = [], isLoading } = useQuery({
    queryKey: ["concepts"],
    queryFn: () => listConcepts(),
  });

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of concepts)
      for (const t of c.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [concepts]);

  const visible = useMemo(() => {
    let list = concepts;
    if (activeTags.size > 0)
      list = list.filter(c => c.tags.some(t => activeTags.has(t)));
    const q = search.trim();
    if (q) list = list.filter(c => matchesConcept(c, q));
    return list;
  }, [concepts, activeTags, search]);

  function toggleTag(tag: string) {
    setActiveTags(prev => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  function clearFilters() {
    setActiveTags(new Set());
    setSearch("");
  }

  function toggleBookmark(id: string) {
    setBookmarks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem("senpai_concept_bookmarks", JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }

  const hasFilter = activeTags.size > 0 || !!search.trim();

  return (
    <div className="library-page">

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="library-header">
        <div className="library-header-row">
          <div className="library-header-text">
            <span className="library-eyebrow">Library · 図書館</span>
            <h1 className="library-title">Go Concepts</h1>
            <p className="library-sub">Named ideas Sensei draws from when reviewing your games.</p>
          </div>

          <div className="library-controls">
            <div className="library-search-wrap">
              <span className="library-search-icon"><SearchIcon /></span>
              <input
                className="library-search-input"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                spellCheck={false}
                aria-label="Search concepts"
              />
              {search && (
                <button
                  className="library-search-clear"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >×</button>
              )}
            </div>

            <TagFilterDropdown
              tagCounts={tagCounts}
              activeTags={activeTags}
              onToggle={toggleTag}
              onClearAll={() => setActiveTags(new Set())}
            />
          </div>
        </div>
      </header>

      {/* ── Active-filter toolbar (only when filtering) ───────── */}
      {hasFilter && (
        <div className="library-toolbar">
          <div className="library-toolbar-chips">
            {[...activeTags].map(t => (
              <button key={t} className="library-active-filter" onClick={() => toggleTag(t)}>
                ✕ {fmtTag(t)}
              </button>
            ))}
            {search.trim() && (
              <button className="library-active-filter" onClick={() => setSearch("")}>
                ✕ "{search.trim()}"
              </button>
            )}
          </div>
          <div className="library-toolbar-right">
            <span className="library-result-count">
              {visible.length} concept{visible.length !== 1 ? "s" : ""}
            </span>
            <button className="library-clear-all" onClick={clearFilters}>Clear all</button>
          </div>
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────── */}
      <div className="library-grid-wrap">
        {!hasFilter && !isLoading && (
          <p className="library-count-label">
            {concepts.length} concept{concepts.length !== 1 ? "s" : ""}
          </p>
        )}

        {isLoading ? (
          <div className="library-empty">
            <div className="library-empty-glyph" style={{ opacity: 0.07 }}>先</div>
            <p style={{ color: "var(--ink-mute)", fontFamily: "var(--font-display)", fontSize: 15 }}>
              Loading concepts…
            </p>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState hasFilter={hasFilter} onClear={clearFilters} />
        ) : (
          <div className="library-grid">
            {visible.map((c, i) => (
              <ConceptCard
                key={c.id}
                concept={c}
                index={i}
                bookmarked={bookmarks.has(c.id)}
                onBookmark={toggleBookmark}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
