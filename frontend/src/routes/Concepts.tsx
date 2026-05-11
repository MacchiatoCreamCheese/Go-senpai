import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listConcepts, type ConceptListItem, type WeaknessItem } from "../api";
import { useIdentity } from "../lib/auth";
import { useProfileWeaknesses } from "../hooks/useProfileData";

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 16;

const ADVANCED_TAGS = new Set(["tactics", "strategy", "endgame", "middlegame", "whole_board", "moyo", "invasion"]);
const BEGINNER_TAGS = new Set(["life_and_death", "fundamentals", "proverb", "local"]);

// Mirrors backend WEAKNESS_TO_CONCEPT_ID — concept IDs that address each weakness.
// The primary match is the exact concept the backend teaches; extras are related concepts.
const WEAKNESS_TO_CONCEPT_IDS: Record<string, string[]> = {
  blunder_opening:         ["opening_principles", "corner_side_center", "direction_of_play", "stay_away_from_thickness"],
  blunder_middlegame:      ["capturing_races", "crosscut", "ladder", "damezumari", "net"],
  blunder_endgame:         ["endgame_tesuji", "monkey_jump", "sente_gote"],
  ignored_top_move:        ["shape_fundamentals", "empty_triangle", "hane_head_of_two", "hane_head_of_three"],
  low_consistency_opening: ["opening_principles", "direction_of_play", "corner_side_center"],
  low_consistency_endgame: ["endgame_tesuji", "monkey_jump", "sente_gote"],
};

// Human-readable labels for weakness themes shown in the UI
const WEAKNESS_LABEL: Record<string, string> = {
  blunder_opening:         "Opening mistakes",
  blunder_middlegame:      "Middlegame fights",
  blunder_endgame:         "Endgame precision",
  ignored_top_move:        "Missed key moves",
  low_consistency_opening: "Opening consistency",
  low_consistency_endgame: "Endgame consistency",
};

const TAG_PALETTE = [
  "var(--border)",
  "var(--pastel-peach)",
  "var(--pastel-yellow)",
  "var(--pastel-green)",
  "var(--pastel-cyan)",
  "var(--pastel-lavender)",
  "var(--pastel-mint)",
  "var(--pastel-pink)",
];

// Colors for every tag that actually appears in the concept corpus
const TAG_COLOR: Record<string, string> = {
  // Shape
  shape:           "var(--pastel-green)",
  good_shape:      "var(--pastel-green)",
  bad_shape:       "var(--border)",
  efficiency:      "var(--pastel-green)",
  connection:      "var(--pastel-mint)",
  eye_shape:       "var(--pastel-mint)",
  // Tactics
  tactics:         "var(--pastel-cyan)",
  tesuji:          "var(--pastel-cyan)",
  capture:         "var(--border)",
  reading:         "var(--pastel-cyan)",
  liberties:       "var(--pastel-peach)",
  // Strategy
  strategy:        "var(--pastel-lavender)",
  whole_board:     "var(--pastel-lavender)",
  influence:       "var(--pastel-lavender)",
  invasion:        "var(--pastel-lavender)",
  moyo:            "var(--pastel-lavender)",
  decision:        "var(--pastel-lavender)",
  // Opening
  opening:         "var(--pastel-yellow)",
  fuseki:          "var(--pastel-yellow)",
  fundamentals:    "var(--pastel-yellow)",
  proverb:         "var(--pastel-yellow)",
  // Endgame
  endgame:         "var(--pastel-peach)",
  yose:            "var(--pastel-peach)",
  counting:        "var(--pastel-peach)",
  territory:       "var(--pastel-peach)",
  tempo:           "var(--pastel-peach)",
  // Middlegame
  middlegame:      "var(--pastel-pink)",
  fighting:        "var(--pastel-pink)",
  attack:          "var(--pastel-pink)",
  capturing_race:  "var(--pastel-pink)",
  semeai:          "var(--pastel-pink)",
  // Life & Death
  life_and_death:  "var(--pastel-mint)",
  corner:          "var(--pastel-mint)",
  local:           "var(--pastel-mint)",
  // Misc
  sabaki:          "var(--pastel-lavender)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDifficulty(tags: string[]): "Beginner" | "Intermediate" | "Advanced" {
  if (tags.some(t => ADVANCED_TAGS.has(t))) return "Advanced";
  if (tags.some(t => BEGINNER_TAGS.has(t))) return "Beginner";
  return "Intermediate";
}

function tagColor(tag: string): string {
  if (TAG_COLOR[tag]) return TAG_COLOR[tag];
  let h = 0;
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) % TAG_PALETTE.length;
  return TAG_PALETTE[h];
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

// ─── Icons ────────────────────────────────────────────────────────────────────

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
        type="button"
        className={`lib-filter-btn${hasActive ? " is-active" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>Tags</span>
        {hasActive && <span className="lib-filter-badge">{activeTags.size}</span>}
        <span style={{ fontSize: 10, opacity: 0.7, display: "inline-block", transition: "transform 150ms", transform: open ? "rotate(180deg)" : "none" }}>
          ▾
        </span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="lib-filter-popover"
          style={{ top: popPos.top, right: popPos.right }}
          role="listbox"
          aria-multiselectable="true"
        >
          <div className="lib-filter-popover-head">
            <span className="lib-filter-popover-title">Filter by tag</span>
            {hasActive && (
              <button
                type="button"
                className="lib-filter-popover-clear"
                onClick={() => { onClearAll(); setOpen(false); }}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="lib-filter-popover-chips">
            {tagCounts.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                role="option"
                aria-selected={activeTags.has(tag)}
                className={`lib-filter-chip${activeTags.has(tag) ? " is-active" : ""}`}
                onClick={() => onToggle(tag)}
              >
                {fmtTag(tag)}
                <span className="lib-filter-chip-count">{count}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Level filter chips ───────────────────────────────────────────────────────

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

function LevelFilterChips({
  activeLevels,
  onToggle,
}: {
  activeLevels: Set<string>;
  onToggle: (l: string) => void;
}) {
  return (
    <div className="lib-level-chips">
      {LEVELS.map(l => (
        <button
          key={l}
          type="button"
          className={`lib-level-chip lib-level-chip--${l.toLowerCase()}${activeLevels.has(l) ? " is-active" : ""}`}
          onClick={() => onToggle(l)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// ─── Hero banner ──────────────────────────────────────────────────────────────

function ConceptsHero({ total, bookmarkedCount }: { total: number; bookmarkedCount: number }) {
  return (
    <div className="gs-card lib-hero">
      <div className="lib-hero-content">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="gs-sticker">図書館 · LIBRARY</span>
          <span className="gs-tag">GO CONCEPTS</span>
        </div>
        <h2 className="lib-hero-title">Study the Language of Go</h2>
        <p className="lib-hero-sub">
          Named ideas Sensei draws from when reviewing your games.
          Build your positional vocabulary one concept at a time.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          {total > 0 && <span className="gs-pill gs-pill--cyan">{total} concepts</span>}
          {bookmarkedCount > 0 && (
            <span className="gs-pill gs-pill--yellow">★ {bookmarkedCount} saved</span>
          )}
        </div>
      </div>
      <div className="lib-hero-kana" aria-hidden="true">智</div>
    </div>
  );
}

// Fallback concepts shown when the user has no weakness data yet
const FEATURED_CONCEPT_IDS = [
  "shape_fundamentals",
  "capturing_races",
  "ladder",
  "empty_triangle",
  "opening_principles",
  "two_eye_rule",
];

// ─── Recommended section ──────────────────────────────────────────────────────

function RecommendedSection({
  concepts,
  weaknesses,
  bookmarks,
  onBookmark,
}: {
  concepts: ConceptListItem[];
  weaknesses: WeaknessItem[];
  bookmarks: Set<string>;
  onBookmark: (id: string) => void;
}) {
  const { picks, contributingWeaknesses, isFallback } = useMemo(() => {
    if (!concepts.length) return { picks: [], contributingWeaknesses: [], isFallback: true };

    const conceptById = new Map(concepts.map(c => [c.id, c]));

    // Weakness-driven picks — drain all weaknesses sorted by severity
    const sorted = [...weaknesses].sort((a, b) => b.severity - a.severity);

    if (sorted.length) {
      const seen = new Set<string>();
      const orderedIds: string[] = [];
      const contributing: WeaknessItem[] = [];

      for (const w of sorted) {
        const wIds = WEAKNESS_TO_CONCEPT_IDS[w.theme] ?? [];
        let addedAny = false;
        for (const id of wIds) {
          if (!seen.has(id)) { seen.add(id); orderedIds.push(id); addedAny = true; }
        }
        if (addedAny) contributing.push(w);
        if (orderedIds.length >= 8) break;
      }

      const weaknessPicks = orderedIds
        .map(id => conceptById.get(id))
        .filter((c): c is ConceptListItem => c !== undefined)
        .slice(0, 4);

      if (weaknessPicks.length) {
        return { picks: weaknessPicks, contributingWeaknesses: contributing, isFallback: false };
      }
    }

    // Fallback: curated foundational concepts
    const fallbackPicks = FEATURED_CONCEPT_IDS
      .map(id => conceptById.get(id))
      .filter((c): c is ConceptListItem => c !== undefined)
      .slice(0, 4);

    return { picks: fallbackPicks, contributingWeaknesses: [], isFallback: true };
  }, [concepts, weaknesses]);

  if (!picks.length) return null;

  return (
    <div className="lib-recommended">
      <div className="lib-section-head">
        <span className="gs-tag">
          {isFallback ? "START HERE · 基礎" : "SENSEI PICK · 推薦"}
        </span>
        {!isFallback && contributingWeaknesses.slice(0, 2).map(w => (
          <span key={w.theme} className="gs-pill gs-pill--pink" style={{ textTransform: "capitalize" }}>
            {WEAKNESS_LABEL[w.theme] ?? w.theme.replace(/_/g, " ")}
          </span>
        ))}
        {isFallback && (
          <span className="gs-pill gs-pill--cyan">Foundational concepts</span>
        )}
      </div>
      <p className="lib-recommended-sub">
        {isFallback
          ? "Essential ideas every Go player should know. Study a game and get a review to unlock personalized picks."
          : "Sensei flagged these as priority study areas based on your recent games."}
      </p>
      <div className="lib-recommended-grid">
        {picks.map((c, i) => (
          <ConceptCard
            key={c.id}
            concept={c}
            index={i}
            bookmarked={bookmarks.has(c.id)}
            onBookmark={onBookmark}
          />
        ))}
      </div>
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
  const diff = getDifficulty(concept.tags);
  const [primary, ...rest] = concept.tags;

  return (
    <Link
      to={`/concepts/${concept.id}`}
      className="lib-concept-card"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
    >
      <div className="lib-card-inner">
        <div className="lib-card-top">
          <div className="lib-card-eyebrow">
            {primary ? (
              <span className="lib-card-primary-tag" style={{ background: tagColor(primary) }}>
                {fmtTag(primary)}
              </span>
            ) : <span />}
            <span className={`lib-card-diff lib-card-diff--${diff.toLowerCase()}`}>{diff}</span>
          </div>
          <h3 className="lib-card-title">{concept.title}</h3>
          {concept.summary && (
            <p className="lib-card-excerpt">{concept.summary}</p>
          )}
        </div>
        <div className="lib-card-footer">
          <div className="lib-card-tags">
            {rest.slice(0, 2).map(t => (
              <span
                key={t}
                className="lib-card-tag"
                style={{ background: tagColor(t) }}
              >
                {fmtTag(t)}
              </span>
            ))}
            {rest.length > 2 && (
              <span className="lib-card-tag lib-card-tag--more">+{rest.length - 2}</span>
            )}
          </div>
          <button
            type="button"
            className={`lib-bookmark${bookmarked ? " is-saved" : ""}`}
            onClick={e => { e.preventDefault(); onBookmark(concept.id); }}
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark this concept"}
          >
            {bookmarked ? "★" : "☆"}
          </button>
        </div>
      </div>
    </Link>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ current, total, onPage }: {
  current: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total <= 1) return null;

  const pages: (number | "…")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push("…");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push("…");
    pages.push(total);
  }

  return (
    <nav className="lib-pagination" aria-label="Page navigation">
      <button
        type="button"
        className="lib-page-btn"
        disabled={current === 1}
        onClick={() => onPage(current - 1)}
      >
        ← Prev
      </button>
      {pages.map((p, i) =>
        typeof p === "number" ? (
          <button
            key={i}
            type="button"
            className={`lib-page-btn${p === current ? " lib-page-btn--active" : ""}`}
            onClick={() => onPage(p)}
            aria-current={p === current ? "page" : undefined}
          >
            {p}
          </button>
        ) : (
          <span key={i} className="lib-page-ellipsis">{p}</span>
        )
      )}
      <button
        type="button"
        className="lib-page-btn"
        disabled={current === total}
        onClick={() => onPage(current + 1)}
      >
        Next →
      </button>
    </nav>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="lib-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="lib-skeleton-card" />
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ hasFilter, onClear }: { hasFilter: boolean; onClear: () => void }) {
  return (
    <div className="lib-empty">
      <div className="lib-empty-glyph">智</div>
      <div className="lib-empty-title">
        {hasFilter ? "No matching concepts" : "No concepts yet"}
      </div>
      <p className="lib-empty-sub">
        {hasFilter
          ? "Try a different search term or clear the active filters."
          : "Run the concept loader to seed the corpus first."}
      </p>
      {hasFilter && (
        <button type="button" className="gs-btn" style={{ marginTop: 8 }} onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Concepts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const gridWrapRef = useRef<HTMLDivElement>(null);

  // URL-driven state
  const search = searchParams.get("search") ?? "";
  const activeTags = new Set(searchParams.getAll("tag"));
  const activeLevels = new Set(searchParams.getAll("level"));
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  // Bookmarks stay in localStorage (personal, not shareable)
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

  const { userId } = useIdentity();
  const { data: weaknesses = [] } = useProfileWeaknesses(userId ?? null);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of concepts)
      for (const t of c.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [concepts]);

  const filtered = useMemo(() => {
    let list = concepts;
    if (activeTags.size > 0)
      list = list.filter(c => c.tags.some(t => activeTags.has(t)));
    if (activeLevels.size > 0)
      list = list.filter(c => activeLevels.has(getDifficulty(c.tags)));
    const q = search.trim();
    if (q) list = list.filter(c => matchesConcept(c, q));
    return list;
  }, [concepts, activeTags, activeLevels, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const hasFilter = activeTags.size > 0 || activeLevels.size > 0 || !!search.trim();
  const activeFilterCount = activeTags.size + activeLevels.size + (search.trim() ? 1 : 0);

  // Scroll to top when page changes
  useEffect(() => {
    gridWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [safePage]);

  // ── State setters ──────────────────────────────────────────────────────────

  function setParam(key: string, values: string[]) {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    values.forEach(v => next.append(key, v));
    next.set("page", "1");
    setSearchParams(next, { replace: true });
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    setSearchParams(next, { replace: true });
  }

  function setSearch(val: string) {
    const next = new URLSearchParams(searchParams);
    if (val) next.set("search", val); else next.delete("search");
    next.set("page", "1");
    setSearchParams(next, { replace: true });
  }

  function toggleTag(tag: string) {
    const next = new Set(activeTags);
    next.has(tag) ? next.delete(tag) : next.add(tag);
    setParam("tag", [...next]);
  }

  function toggleLevel(level: string) {
    const next = new Set(activeLevels);
    next.has(level) ? next.delete(level) : next.add(level);
    setParam("level", [...next]);
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
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

  return (
    <div className="lib-page">

      {/* ── Filter bar (header) ────────────────────────────── */}
      <header className="lib-header">
        <div className="lib-header-inner">
          <div className="lib-controls">
            <div className="lib-search-wrap">
              <span className="lib-search-icon"><SearchIcon /></span>
              <input
                className="lib-search-input"
                placeholder="Search concepts…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                spellCheck={false}
                aria-label="Search concepts"
              />
              {search && (
                <button
                  type="button"
                  className="lib-search-clear"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >×</button>
              )}
            </div>

            <LevelFilterChips activeLevels={activeLevels} onToggle={toggleLevel} />

            <TagFilterDropdown
              tagCounts={tagCounts}
              activeTags={activeTags}
              onToggle={toggleTag}
              onClearAll={() => setParam("tag", [])}
            />

            {hasFilter && (
              <button type="button" className="lib-clear-all-btn" onClick={clearFilters}>
                Clear{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {hasFilter && (
          <div className="lib-active-chips">
            {[...activeTags].map(t => (
              <button key={t} type="button" className="lib-active-chip" onClick={() => toggleTag(t)}>
                ✕ {fmtTag(t)}
              </button>
            ))}
            {[...activeLevels].map(l => (
              <button key={l} type="button" className="lib-active-chip" onClick={() => toggleLevel(l)}>
                ✕ {l}
              </button>
            ))}
            {search.trim() && (
              <button type="button" className="lib-active-chip" onClick={() => setSearch("")}>
                ✕ &ldquo;{search.trim()}&rdquo;
              </button>
            )}
            <span className="lib-result-count">
              {filtered.length} concept{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </header>

      {/* ── Scrollable content ────────────────────────────── */}
      <div className="lib-grid-wrap" ref={gridWrapRef}>

        {/* Hero — always shown when concepts loaded */}
        {!isLoading && concepts.length > 0 && (
          <ConceptsHero total={concepts.length} bookmarkedCount={bookmarks.size} />
        )}

        {/* Recommended — hidden when any filter is active */}
        {!isLoading && !hasFilter && (
          <RecommendedSection
            concepts={concepts}
            weaknesses={weaknesses}
            bookmarks={bookmarks}
            onBookmark={toggleBookmark}
          />
        )}

        {/* Section label above main grid */}
        {!isLoading && (
          <div className="lib-section-head">
            <span className="gs-tag">
              {hasFilter ? "RESULTS · 結果" : "ALL CONCEPTS · 全概念"}
            </span>
            <span className="lib-result-count">
              {filtered.length} concept{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState hasFilter={hasFilter} onClear={clearFilters} />
        ) : (
          <>
            <div className="lib-grid">
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
            <Pagination current={safePage} total={totalPages} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
