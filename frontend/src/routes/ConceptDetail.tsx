import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getConceptDetail } from "../services/conceptDetailService";
import { renderMarkdown } from "../lib/markdown";
import type { ConceptSection, SectionKind } from "../types/concept";

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

const DIFF_BG: Record<string, string> = {
  Beginner:     "var(--pastel-green)",
  Intermediate: "var(--pastel-yellow)",
  Advanced:     "var(--pastel-lavender)",
};

const SECTION_KIND_ICON: Record<SectionKind, string> = {
  mechanics:       "⚙",
  strategic:       "♟",
  examples:        "◉",
  variations:      "⇌",
  common_mistakes: "✕",
};

function fmtTag(t: string) { return t.replace(/_/g, " "); }

function tagAccent(tags: string[]): string {
  for (const t of tags) if (TAG_ACCENT[t]) return TAG_ACCENT[t];
  return "var(--border)";
}

// ─── TOC component ────────────────────────────────────────────────────────────

function TableOfContents({
  sections,
  activeId,
}: {
  sections: ConceptSection[];
  activeId: string | null;
}) {
  function scrollTo(id: string) {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="cd-toc">
      <div className="cd-toc-label">Contents</div>
      <ul className="cd-toc-list">
        <li>
          <button
            className={`cd-toc-item${activeId === "overview" ? " is-active" : ""}`}
            onClick={() => document.getElementById("cd-overview")?.scrollIntoView({ behavior: "smooth" })}
          >
            Overview
          </button>
        </li>
        {sections.map(s => (
          <li key={s.id}>
            <button
              className={`cd-toc-item${activeId === s.id ? " is-active" : ""}`}
              onClick={() => scrollTo(s.id)}
            >
              <span className="cd-toc-icon">{SECTION_KIND_ICON[s.kind]}</span>
              {s.heading}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─── Section renderers ────────────────────────────────────────────────────────

function MechanicsSection({ section }: { section: ConceptSection }) {
  return (
    <section id={`section-${section.id}`} className="cd-section">
      <h2 className="cd-section-heading">
        <span className="cd-section-icon">{SECTION_KIND_ICON[section.kind]}</span>
        {section.heading}
      </h2>
      <div className="cd-mechanics-card">
        <p className="cd-mechanics-intro">{section.body}</p>
        {section.steps && section.steps.length > 0 && (
          <ol className="cd-steps">
            {section.steps.map(s => (
              <li key={s.step} className="cd-step">
                <span className="cd-step-num">{s.step}</span>
                <span className="cd-step-text">{s.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ProseSection({ section }: { section: ConceptSection }) {
  return (
    <section id={`section-${section.id}`} className="cd-section">
      <h2 className="cd-section-heading">
        <span className="cd-section-icon">{SECTION_KIND_ICON[section.kind]}</span>
        {section.heading}
      </h2>
      <div
        className="cd-prose"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(section.body) }}
      />
    </section>
  );
}

function renderSection(section: ConceptSection) {
  if (section.kind === "mechanics") return <MechanicsSection key={section.id} section={section} />;
  return <ProseSection key={section.id} section={section} />;
}

// ─── Bookmark button ─────────────────────────────────────────────────────────

function useBookmark(conceptId: string) {
  const [saved, setSaved] = useState(() => {
    try {
      const raw = localStorage.getItem("senpai_concept_bookmarks");
      const ids: string[] = raw ? JSON.parse(raw) : [];
      return ids.includes(conceptId);
    } catch {
      return false;
    }
  });

  function toggle() {
    setSaved(prev => {
      const next = !prev;
      try {
        const raw = localStorage.getItem("senpai_concept_bookmarks");
        const ids: string[] = raw ? JSON.parse(raw) : [];
        const updated = next ? [...ids, conceptId] : ids.filter(id => id !== conceptId);
        localStorage.setItem("senpai_concept_bookmarks", JSON.stringify(updated));
      } catch { /* ignore */ }
      return next;
    });
  }

  return { saved, toggle };
}

// ─── IntersectionObserver for active TOC item ─────────────────────────────────

function useActiveSection(sectionIds: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach(id => {
      const el = document.getElementById(`section-${id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveId(id); },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach(o => o.disconnect());
  }, [sectionIds]);

  return activeId;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConceptDetail() {
  const { conceptId } = useParams<{ conceptId: string }>();
  const navigate = useNavigate();

  const { data: concept, isLoading } = useQuery({
    queryKey: ["concept-detail", conceptId],
    queryFn: () => (conceptId ? getConceptDetail(conceptId) : Promise.resolve(null)),
    enabled: !!conceptId,
  });

  const { saved: bookmarked, toggle: toggleBookmark } = useBookmark(conceptId ?? "");

  const sectionIds = concept?.sections.map(s => s.id) ?? [];
  const activeSection = useActiveSection(sectionIds);

  // Related search filter
  const [relSearch, setRelSearch] = useState("");
  const filteredRelated = (concept?.related ?? []).filter(r =>
    r.title.toLowerCase().includes(relSearch.toLowerCase()) ||
    r.tags.some(t => t.includes(relSearch.toLowerCase()))
  );

  const relInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="cd-loading">
        <div className="cd-loading-glyph">先</div>
        <p>Loading…</p>
      </div>
    );
  }

  if (!concept) {
    return (
      <div className="stub-page">
        <div className="stub-mark">智</div>
        <h1>Concept not found</h1>
        <p>This concept hasn't been seeded into the corpus yet.</p>
        <Link to="/concepts" className="gs-btn">← Back to library</Link>
      </div>
    );
  }

  const accent = tagAccent(concept.tags);

  return (
    <div className="cd-page">

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="cd-hero" style={{ "--accent": accent } as React.CSSProperties}>
        <div className="cd-hero-inner">
          <div className="cd-hero-nav">
            <button className="cd-back-btn" onClick={() => navigate("/concepts")}>
              ← Library
            </button>
            <button
              className={`cd-bookmark-btn${bookmarked ? " is-saved" : ""}`}
              onClick={toggleBookmark}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark this concept"}
            >
              {bookmarked ? "★" : "☆"}
              <span>{bookmarked ? "Saved" : "Save"}</span>
            </button>
          </div>

          <h1 className="cd-title">{concept.title}</h1>

          <div className="cd-hero-meta">
            <span className="cd-difficulty" style={{ background: DIFF_BG[concept.difficulty] ?? "var(--pastel-yellow)" }}>
              {concept.difficulty}
            </span>
            <span className="cd-read-time">{concept.readingMinutes} min read</span>
            <div className="cd-tags">
              {concept.tags.map(t => (
                <Link
                  key={t}
                  to={`/concepts?tag=${encodeURIComponent(t)}`}
                  className="cd-tag-chip"
                  style={{ background: TAG_ACCENT[t] ?? "var(--pastel-cyan)" }}
                >
                  {fmtTag(t)}
                </Link>
              ))}
            </div>
          </div>

          <p className="cd-overview" id="cd-overview">{concept.overview}</p>
        </div>
      </div>

      {/* ── Body: article + sidebar ────────────────────────────── */}
      <div className="cd-body">

        {/* Main article */}
        <article className="cd-article">

          {concept.proTip && (
            <aside className="cd-pro-tip">
              <span className="cd-pro-tip-label">Pro tip</span>
              <span className="cd-pro-tip-text">{concept.proTip}</span>
            </aside>
          )}

          {concept.sections.map(renderSection)}

          {/* Sensei commentary */}
          {concept.senseiQuote && (
            <blockquote className="cd-sensei-quote">
              <div className="cd-sensei-glyph">先</div>
              <p className="cd-sensei-text">"{concept.senseiQuote.text}"</p>
              {concept.senseiQuote.attribution && (
                <footer className="cd-sensei-attr">— {concept.senseiQuote.attribution}</footer>
              )}
            </blockquote>
          )}

          {/* Prev / Next nav */}
          <nav className="cd-prev-next">
            {concept.prev ? (
              <Link to={`/concepts/${concept.prev.id}`} className="cd-nav-link cd-nav-prev">
                <span className="cd-nav-arrow">←</span>
                <span className="cd-nav-label">Previous</span>
                <span className="cd-nav-title">{concept.prev.title}</span>
              </Link>
            ) : <div />}
            {concept.next ? (
              <Link to={`/concepts/${concept.next.id}`} className="cd-nav-link cd-nav-next">
                <span className="cd-nav-arrow">→</span>
                <span className="cd-nav-label">Next</span>
                <span className="cd-nav-title">{concept.next.title}</span>
              </Link>
            ) : <div />}
          </nav>
        </article>

        {/* Sticky sidebar */}
        <aside className="cd-sidebar">
          <div className="cd-sidebar-inner">

            <TableOfContents sections={concept.sections} activeId={activeSection} />

            {/* Related concepts */}
            {concept.related.length > 0 && (
              <div className="cd-related">
                <div className="cd-related-header">
                  <span className="cd-related-title">Related</span>
                  {concept.related.length > 3 && (
                    <div className="cd-related-search-wrap">
                      <input
                        ref={relInputRef}
                        className="cd-related-search"
                        placeholder="Filter…"
                        value={relSearch}
                        onChange={e => setRelSearch(e.target.value)}
                        aria-label="Filter related concepts"
                      />
                      {relSearch && (
                        <button
                          className="cd-related-clear"
                          onClick={() => { setRelSearch(""); relInputRef.current?.focus(); }}
                          aria-label="Clear filter"
                        >×</button>
                      )}
                    </div>
                  )}
                </div>
                <ul className="cd-related-list">
                  {filteredRelated.length === 0 ? (
                    <li className="cd-related-empty">No match</li>
                  ) : filteredRelated.map(r => (
                    <li key={r.id}>
                      <Link to={`/concepts/${r.id}`} className="cd-related-item">
                        <span className="cd-related-name">{r.title}</span>
                        <span className="cd-related-rel">{r.relation}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        </aside>
      </div>
    </div>
  );
}
