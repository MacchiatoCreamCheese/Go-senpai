import { useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { WeaknessBar } from "../components/WeaknessBar";
import { HandleEditor } from "../components/HandleEditor";
import { useAuth, useIdentity } from "../lib/auth";
import {
  useProfileGames,
  useProfileWeaknesses,
  useProfileConcepts,
  useProfileAnalytics,
  useProfileDrillStats,
  useProfileStats,
} from "../hooks/useProfileData";
import { useBookmarks } from "../hooks/useBookmarks";
import { avatarColor, deriveMockRank } from "../data/mockProfile";
import type {
  EnrichedMatch,
  ConceptProgressItem,
  WeeklySeries,
  HistoryFilter,
  DrillStats,
  ProfileAnalyticsData,
} from "../types/profile";
import type { WeaknessItem } from "../api";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtShort(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtAxisLabel(week: string) {
  const parsed = new Date(`${week}T00:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  }
  return week.replace(/^\d{4}-W/, "W");
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function TabSkeleton() {
  return (
    <div className="prf-skeleton-wrap" aria-busy="true" aria-label="Loading…">
      {[80, 60, 90, 50, 75].map((w, i) => (
        <div key={i} className="prf-skeleton-line" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function TabError({ message }: { message: string }) {
  return (
    <div className="prf-error">
      <div className="prf-error-glyph">⚠</div>
      <div className="prf-error-msg">{message}</div>
      <p className="prf-error-hint">Try refreshing the page.</p>
    </div>
  );
}

function NoDataPlaceholder({ label }: { label: string }) {
  return (
    <div className="prf-no-data">
      <span className="prf-no-data-glyph">◌</span>
      <span className="prf-no-data-label">{label}</span>
      <span className="prf-no-data-sub">A little more activity will fill this in.</span>
    </div>
  );
}

// ─── Area chart ────────────────────────────────────────────────────────────────

function AreaChart({
  data,
  strokeColor,
  fillId,
  fillColor,
}: {
  data: WeeklySeries[];
  strokeColor: string;
  fillId: string;
  fillColor: string;
}) {
  const W = 400, H = 72;
  const PAD = { l: 14, r: 14, t: 8, b: 6 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  const max = Math.max(1, ...data.map(d => d.value));
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * iW;
  const y = (v: number) => PAD.t + iH - (v / max) * iH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${(PAD.t + iH).toFixed(1)} L ${PAD.l} ${(PAD.t + iH).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", overflow: "hidden" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.55" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${fillId})`} />
      <path d={line} fill="none" stroke={strokeColor} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r="3"
        fill={strokeColor} stroke="var(--bg-2)" strokeWidth="1.5"
      />
    </svg>
  );
}

function ChartBlock({
  label,
  data,
  strokeColor,
  fillColor,
  unit = "",
}: {
  label: string;
  data: WeeklySeries[] | null;
  strokeColor: string;
  fillColor: string;
  unit?: string;
}) {
  const fillId = `grad-${label.replace(/\s+/g, "-").toLowerCase()}`;

  if (!data || data.length < 2) {
    return (
      <div className="prf-chart-block">
        <div className="prf-chart-header">
          <span className="prf-chart-label">{label}</span>
        </div>
        <NoDataPlaceholder label="Not enough data yet" />
      </div>
    );
  }

  const latest = data[data.length - 1].value;
  const prev = data[data.length - 2].value;
  const delta = latest - prev;
  const showDelta = data.length >= 3 && Math.abs(delta) > 0;
  const weekLabels = data.slice(-5);

  return (
    <div className="prf-chart-block">
      <div className="prf-chart-header">
        <span className="prf-chart-label">{label}</span>
        <span className="prf-chart-latest">
          {latest % 1 === 0 ? latest : latest.toFixed(1)}{unit}
          {showDelta && (
            <span className={`prf-chart-delta${delta > 0 ? " up" : " dn"}`}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
            </span>
          )}
        </span>
      </div>
      <div className="prf-chart-canvas">
        <AreaChart data={data} strokeColor={strokeColor} fillId={fillId} fillColor={fillColor} />
      </div>
      <div className="prf-chart-axis">
        {weekLabels.map((d, i) => (
          <span
            key={d.week}
            style={
              i === 0
                ? { left: "0%", transform: "translateX(0)" }
                : i === weekLabels.length - 1
                  ? { left: "100%", transform: "translateX(-100%)" }
                  : { left: `${(i / Math.max(weekLabels.length - 1, 1)) * 100}%`, transform: "translateX(-50%)" }
            }
          >
            {fmtAxisLabel(d.week)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Stat block ────────────────────────────────────────────────────────────────

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="prf-stat">
      <span className="prf-stat-value">{value}</span>
      <span className="prf-stat-label">{label}</span>
      {sub && <span className="prf-stat-sub">{sub}</span>}
    </div>
  );
}

// ─── Result chip ───────────────────────────────────────────────────────────────

function ResultChip({ match }: { match: EnrichedMatch }) {
  if (!match.isFinished) return <span className="prf-result-chip ongoing">ongoing</span>;
  if (match.isWin === true)  return <span className="prf-result-chip win">Win</span>;
  if (match.isWin === false) return <span className="prf-result-chip loss">Loss</span>;
  return <span className="prf-result-chip draw">{match.result ?? "—"}</span>;
}

// ─── Progress badge ────────────────────────────────────────────────────────────

function ProgressBadge({ state }: { state: ConceptProgressItem["progressState"] }) {
  const map = {
    viewed:     { label: "Viewed",     cls: "viewed" },
    practicing: { label: "Practicing", cls: "practicing" },
    mastered:   { label: "Mastered",   cls: "mastered" },
  };
  const { label, cls } = map[state];
  return <span className={`prf-progress-badge ${cls}`}>{label}</span>;
}

// ─── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  games,
  concepts,
  weaknesses,
  bookmarks,
}: {
  games: EnrichedMatch[];
  concepts: ConceptProgressItem[];
  weaknesses: WeaknessItem[];
  bookmarks: Set<string>;
}) {
  const recentGames = games.slice(0, 4);
  const topWeaknesses = weaknesses.slice().sort((a, b) => b.severity - a.severity).slice(0, 3);
  const bookmarkedConcepts = concepts.filter(c => bookmarks.has(c.conceptId));
  const lastStudied = concepts.length > 0
    ? [...concepts].sort((a, b) =>
        (b.lastTaughtAt ?? "").localeCompare(a.lastTaughtAt ?? "")
      )[0]
    : null;

  return (
    <div className="prf-overview">

      {lastStudied && (
        <div className="prf-continue-card">
          <div className="prf-continue-label">Continue learning</div>
          <Link to={`/concepts/${lastStudied.conceptId}`} className="prf-continue-inner">
            <div className="prf-continue-title">{lastStudied.title}</div>
            <div className="prf-continue-meta">
              <ProgressBadge state={lastStudied.progressState} />
              <span>studied {lastStudied.timesTaught}×</span>
            </div>
            <span className="prf-continue-arrow">→</span>
          </Link>
        </div>
      )}

      <div className="prf-ov-grid">
        <section className="prf-ov-section">
          <h3 className="prf-ov-section-title">Recent Games</h3>
          {recentGames.length === 0 ? (
            <p className="prf-ov-empty">
              No games yet. <Link to="/lobby" className="prf-link">Play one →</Link>
            </p>
          ) : (
            <ul className="prf-activity-list">
              {recentGames.map(g => (
                <li key={g.id}>
                  <Link to={`/games/${g.id}`} className="prf-activity-item">
                    {g.playerColor && (
                      <span className={`prf-color-dot ${g.playerColor === "B" ? "black" : "white"}`} />
                    )}
                    <span className="prf-activity-opp">
                      {g.opponentType === "ai" && <span className="prf-ai-badge">先</span>}
                      {g.opponentHandle ?? "Opponent"}
                    </span>
                    <ResultChip match={g} />
                    <span className="prf-activity-meta">{g.boardSize}×{g.boardSize} · {fmtShort(g.startedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="prf-ov-section">
          <h3 className="prf-ov-section-title">Focus Areas</h3>
          {topWeaknesses.length === 0 ? (
            <p className="prf-ov-empty">Play a reviewed game to surface your weak spots.</p>
          ) : (
            <div className="prf-weakness-stack">
              {topWeaknesses.map(w => (
                <WeaknessBar key={w.theme} weakness={w} compact />
              ))}
            </div>
          )}
        </section>
      </div>

      {bookmarkedConcepts.length > 0 && (
        <section className="prf-ov-section" style={{ marginTop: 8 }}>
          <h3 className="prf-ov-section-title">Saved Concepts</h3>
          <div className="prf-saved-grid">
            {bookmarkedConcepts.map(c => (
              <Link key={c.conceptId} to={`/concepts/${c.conceptId}`} className="prf-saved-item">
                <span className="prf-saved-title">{c.title}</span>
                <ProgressBadge state={c.progressState} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── History tab ───────────────────────────────────────────────────────────────

function HistoryTab({ games }: { games: EnrichedMatch[] }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [sortAsc, setSortAsc] = useState(false);

  const FILTERS: { id: HistoryFilter; label: string }[] = [
    { id: "all",    label: "All" },
    { id: "wins",   label: "Wins" },
    { id: "losses", label: "Losses" },
    { id: "ai",     label: "vs AI" },
    { id: "human",  label: "vs Human" },
  ];

  const visible = useMemo(() => {
    let list = [...games];
    if (filter === "wins")   list = list.filter(g => g.isWin === true);
    if (filter === "losses") list = list.filter(g => g.isWin === false);
    if (filter === "ai")     list = list.filter(g => g.opponentType === "ai");
    if (filter === "human")  list = list.filter(g => g.opponentType === "human");
    list.sort((a, b) => {
      const cmp = a.startedAt.localeCompare(b.startedAt);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [games, filter, sortAsc]);

  if (games.length === 0) {
    return (
      <div className="prf-empty">
        <div className="prf-empty-glyph">碁</div>
        <div className="prf-empty-title">No games yet</div>
        <p className="prf-empty-sub">Your match history will appear here after your first game.</p>
        <Link to="/lobby" className="gs-btn gs-btn--primary" style={{ marginTop: 12 }}>Play a game →</Link>
      </div>
    );
  }

  return (
    <div className="prf-history">
      <div className="prf-history-toolbar">
        <div className="prf-filter-row">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`prf-filter-btn${filter === f.id ? " is-active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          className="prf-sort-btn"
          onClick={() => setSortAsc(v => !v)}
          title="Toggle sort order"
        >
          {sortAsc ? "Oldest first" : "Newest first"} ⇅
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="prf-history-empty">No games match this filter.</p>
      ) : (
        <ul className="prf-history-list">
          {visible.map(g => (
            <li key={g.id}>
              <div className="prf-history-row">
                {g.playerColor && (
                  <span
                    className={`prf-color-dot ${g.playerColor === "B" ? "black" : "white"}`}
                    title={`Played as ${g.playerColor === "B" ? "Black" : "White"}`}
                  />
                )}
                <span className="prf-history-board">{g.boardSize}×{g.boardSize}</span>
                <span className="prf-history-opp">
                  {g.opponentType === "ai" && <span className="prf-ai-badge">先</span>}
                  {g.opponentHandle ?? "Opponent"}
                </span>
                <ResultChip match={g} />
                <span className="prf-history-date">{fmt(g.startedAt)}</span>
                <Link to={`/games/${g.id}/review`} className="prf-review-btn">Review →</Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="prf-history-foot">
        <span>{visible.length} of {games.length} game{games.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

// ─── Concepts tab ──────────────────────────────────────────────────────────────

function ConceptsTab({ concepts }: { concepts: ConceptProgressItem[] }) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<ConceptProgressItem["progressState"] | "all">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => ({
    viewed:     concepts.filter(c => c.progressState === "viewed").length,
    practicing: concepts.filter(c => c.progressState === "practicing").length,
    mastered:   concepts.filter(c => c.progressState === "mastered").length,
  }), [concepts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return concepts.filter(c => {
      if (stateFilter !== "all" && c.progressState !== stateFilter) return false;
      if (q) return c.title.toLowerCase().includes(q);
      return true;
    });
  }, [concepts, search, stateFilter]);

  if (concepts.length === 0) {
    return (
      <div className="prf-empty">
        <div className="prf-empty-glyph">智</div>
        <div className="prf-empty-title">No concepts learned yet</div>
        <p className="prf-empty-sub">Ask Sensei for a lesson and your learned concepts will appear here.</p>
        <Link to="/coach" className="gs-btn gs-btn--primary" style={{ marginTop: 12 }}>Go to Coach →</Link>
      </div>
    );
  }

  return (
    <div className="prf-concepts">
      <div className="prf-cncpt-summary">
        {(["all", "viewed", "practicing", "mastered"] as const).map(s => (
          <button
            key={s}
            className={`prf-cncpt-stat${stateFilter === s ? " is-active" : ""}`}
            onClick={() => setStateFilter(s)}
          >
            <span className="prf-cncpt-stat-n" style={
              s === "practicing" ? { color: "var(--tier-ok)" }
              : s === "mastered" ? { color: "var(--tier-good)" }
              : {}
            }>
              {s === "all" ? concepts.length : counts[s]}
            </span>
            <span className="prf-cncpt-stat-l">
              {s === "all" ? "Total" : s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          </button>
        ))}
      </div>

      <div className="prf-cncpt-toolbar">
        <div className="prf-cncpt-search-wrap">
          <svg className="prf-cncpt-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={searchRef}
            className="prf-cncpt-search"
            placeholder="Search concepts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            spellCheck={false}
          />
          {search && (
            <button className="prf-cncpt-search-clear"
              onClick={() => { setSearch(""); searchRef.current?.focus(); }}>×</button>
          )}
        </div>
        <span className="prf-cncpt-count">{visible.length} concept{visible.length !== 1 ? "s" : ""}</span>
      </div>

      {visible.length === 0 ? (
        <p style={{ color: "var(--ink-mute)", fontSize: 13, padding: "24px 0" }}>No match.</p>
      ) : (
        <div className="prf-cncpt-grid">
          {visible.map(c => (
            <Link key={c.conceptId} to={`/concepts/${c.conceptId}`} className="prf-concept-card">
              <div className="prf-concept-card-top">
                <ProgressBadge state={c.progressState} />
              </div>
              <div className="prf-concept-card-title">{c.title}</div>
              <div className="prf-concept-card-meta">
                taught {c.timesTaught}×
                {c.lastTaughtAt && <> · last {fmtShort(c.lastTaughtAt)}</>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Analytics tab ─────────────────────────────────────────────────────────────

function AnalyticsTab({
  analytics,
  drillStats,
  weaknesses,
}: {
  analytics: ProfileAnalyticsData;
  drillStats: DrillStats | null;
  weaknesses: WeaknessItem[];
}) {
  const lastGamesValue = analytics.gamesPerWeek
    ? analytics.gamesPerWeek[analytics.gamesPerWeek.length - 1]?.value ?? null
    : null;
  const lastDrillsValue = analytics.drillsPerWeek
    ? analytics.drillsPerWeek[analytics.drillsPerWeek.length - 1]?.value ?? null
    : null;

  return (
    <div className="prf-analytics">

      {/* Summary stats — only real values; no hardcoded fallbacks */}
      <div className="prf-analytics-summary">
        <div className="prf-an-stat">
          <span className="prf-an-stat-value">
            {drillStats?.accuracy != null ? pct(drillStats.accuracy) : "—"}
          </span>
          <span className="prf-an-stat-label">Puzzle accuracy</span>
          {drillStats && drillStats.totalAttempts === 0 && (
            <span className="prf-an-stat-hint">No drills yet</span>
          )}
        </div>
        <div className="prf-an-stat">
          <span className="prf-an-stat-value">
            {lastGamesValue !== null ? lastGamesValue.toFixed(1) : "—"}
          </span>
          <span className="prf-an-stat-label">Games this week</span>
        </div>
        <div className="prf-an-stat">
          <span className="prf-an-stat-value">
            {lastDrillsValue !== null ? lastDrillsValue.toFixed(0) : "—"}
          </span>
          <span className="prf-an-stat-label">Drills this week</span>
        </div>
        {drillStats && drillStats.totalAttempts > 0 && (
          <div className="prf-an-stat">
            <span className="prf-an-stat-value">{drillStats.totalAttempts}</span>
            <span className="prf-an-stat-label">Total drills</span>
          </div>
        )}
      </div>

      {/* Charts — null series renders "Not enough data" placeholder */}
      <div className="prf-charts-grid">
        <ChartBlock
          label="Games per week"
          data={analytics.gamesPerWeek}
          strokeColor="var(--border-deep)"
          fillColor="var(--pastel-pink)"
        />
        <ChartBlock
          label="Drills per week"
          data={analytics.drillsPerWeek}
          strokeColor="#6B9FC8"
          fillColor="var(--pastel-blue)"
        />
        <ChartBlock
          label="Weakness severity trend"
          data={analytics.weaknessSeverityHistory}
          strokeColor="#7C9E6E"
          fillColor="var(--pastel-green)"
        />
      </div>

      {/* Top studied concepts */}
      {analytics.topStudiedConcepts.length > 0 && (() => {
        const maxCount = Math.max(1, ...analytics.topStudiedConcepts.map(c => c.count));
        return (
          <section className="prf-analytics-section">
            <h3 className="prf-analytics-heading">Most Studied Concepts</h3>
            <div className="prf-top-concepts">
              {analytics.topStudiedConcepts.map(c => (
                <div key={c.title} className="prf-top-concept-row">
                  <span className="prf-top-concept-title">{c.title}</span>
                  <div className="prf-top-concept-bar-wrap">
                    <div className="prf-top-concept-bar" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                  </div>
                  <span className="prf-top-concept-count">{c.count}×</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Weakness breakdown */}
      {weaknesses.length > 0 && (
        <section className="prf-analytics-section">
          <h3 className="prf-analytics-heading">Weakness Breakdown</h3>
          <div className="prf-weakness-stack">
            {weaknesses.slice().sort((a, b) => b.severity - a.severity).map(w => (
              <WeaknessBar key={w.theme} weakness={w} />
            ))}
          </div>
        </section>
      )}

      {/* Empty analytics state */}
      {!analytics.gamesPerWeek && !analytics.drillsPerWeek && !analytics.weaknessSeverityHistory
        && analytics.topStudiedConcepts.length === 0 && weaknesses.length === 0 && (
        <div className="prf-empty prf-empty--analytics" style={{ marginTop: 32 }}>
          <div className="prf-empty-glyph">析</div>
          <div className="prf-empty-title">No analytics data yet</div>
          <p className="prf-empty-sub">Play games and complete drills to see your progress here.</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

type TabId = "overview" | "history" | "concepts" | "analytics";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",  label: "Overview" },
  { id: "history",   label: "History" },
  { id: "concepts",  label: "Concepts" },
  { id: "analytics", label: "Analytics" },
];

function tabFromPathname(pathname: string): TabId {
  if (pathname.endsWith("/history"))   return "history";
  if (pathname.endsWith("/concepts"))  return "concepts";
  if (pathname.endsWith("/analytics")) return "analytics";
  return "overview";
}

export default function Profile() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const { profile, legacy } = useAuth();
  const { userId: meId, displayName: meHandle } = useIdentity();
  const location = useLocation();
  const navigate = useNavigate();

  const userId = paramId ?? meId;
  const isMe = !paramId || paramId === meId;
  const handle = (isMe ? meHandle : null) ?? userId?.slice(0, 8) ?? "Player";

  const urlTab = useMemo(() => tabFromPathname(location.pathname), [location.pathname]);
  const [localTab, setLocalTab] = useState<TabId>("overview");
  const activeTab = isMe ? urlTab : localTab;

  function goToTab(t: TabId) {
    if (isMe) {
      navigate(t === "overview" ? "/profile" : `/profile/${t}`);
    } else {
      setLocalTab(t);
    }
  }

  // ── Data ────────────────────────────────────────────────────────────────────

  const needConcepts = activeTab === "concepts" || activeTab === "overview" || activeTab === "analytics";

  const { data: games = [],   isLoading: gamesLoading,    error: gamesError    } = useProfileGames(userId);
  const { data: weaknesses = [], error: weaknessesError } = useProfileWeaknesses(userId);
  const { data: concepts = [], isLoading: conceptsLoading, error: conceptsError } = useProfileConcepts(userId, { enabled: needConcepts });
  const { data: analytics,     isLoading: analyticsLoading, error: analyticsError } = useProfileAnalytics(userId, { enabled: activeTab === "analytics" });
  const { data: drillStats,    isLoading: drillStatsLoading } = useProfileDrillStats(userId);

  const stats = useProfileStats(games, concepts);
  const { ids: bookmarkIds } = useBookmarks();

  // ── Guards ───────────────────────────────────────────────────────────────────

  if (!userId) {
    return (
      <div className="stub-page">
        <div className="stub-mark">己</div>
        <h1>Profile</h1>
        <p>Set a name in the Lobby first.</p>
        <Link to="/lobby" className="gs-btn">Go to Lobby →</Link>
      </div>
    );
  }

  const avatarBg = avatarColor(handle);
  const avatarLetter = handle[0].toUpperCase();
  const rank = deriveMockRank(stats.totalGames);

  return (
    <div className="prf-page">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="prf-hero">
        <div className="prf-hero-inner">
          <div className="prf-hero-top">
            <div className="prf-avatar" style={{ background: avatarBg }}>
              <span className="prf-avatar-letter">{avatarLetter}</span>
            </div>
            <div className="prf-identity">
              <div className="prf-identity-row">
                <h1 className="prf-identity-name">{handle}</h1>
                <span className="prf-rank-badge">{rank}</span>
              </div>
              <div className="prf-identity-meta">
                {gamesLoading
                  ? "Loading…"
                  : `${stats.totalGames} game${stats.totalGames !== 1 ? "s" : ""} played${stats.winRate !== null ? ` · ${pct(stats.winRate)} win rate` : ""}`
                }
              </div>
              {isMe && !legacy && profile && (
                <div className="prf-handle-editor"><HandleEditor /></div>
              )}
            </div>
          </div>

          <div className="prf-stats-row">
            <StatBlock label="Games" value={gamesLoading ? "…" : stats.totalGames.toString()} />
            <StatBlock
              label="Win rate"
              value={gamesLoading ? "…" : (stats.winRate !== null ? pct(stats.winRate) : "—")}
              sub={!gamesLoading && stats.finishedGames > 0 ? `${stats.finishedGames} finished` : undefined}
            />
            <StatBlock
              label="Concepts"
              value={conceptsLoading && needConcepts ? "…" : stats.totalConcepts.toString()}
            />
            <StatBlock
              label="Puzzle accuracy"
              value={drillStatsLoading ? "…" : (drillStats?.accuracy != null ? pct(drillStats.accuracy) : "—")}
            />
          </div>
        </div>
      </div>

      {/* ── Tab nav ──────────────────────────────────────────────── */}
      <nav className="prf-nav" role="tablist">
        <div className="prf-nav-inner">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`prf-tab${activeTab === t.id ? " is-active" : ""}`}
              onClick={() => goToTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <div className="prf-body">
        <div className="prf-body-inner">

          {activeTab === "overview" && (
            gamesLoading ? <TabSkeleton /> :
            gamesError   ? <TabError message="Could not load game history." /> :
            weaknessesError ? <TabError message="Could not load weakness data." /> :
            !games.length && !weaknesses.length && !concepts.length ? (
              <div className="prf-empty">
                <div className="prf-empty-glyph">己</div>
                <div className="prf-empty-title">Profile is waiting</div>
                <p className="prf-empty-sub">Play a game and ask Sensei for a lesson to start building your profile.</p>
              </div>
            ) : (
            <OverviewTab
              games={games}
              concepts={concepts}
              weaknesses={weaknesses}
              bookmarks={bookmarkIds}
            />
            )
          )}

          {activeTab === "history" && (
            gamesLoading ? <TabSkeleton /> :
            gamesError   ? <TabError message="Could not load match history." /> :
            <HistoryTab games={games} />
          )}

          {activeTab === "concepts" && (
            conceptsLoading ? <TabSkeleton /> :
            conceptsError   ? <TabError message="Could not load concepts." /> :
            <ConceptsTab concepts={concepts} />
          )}

          {activeTab === "analytics" && (
            analyticsLoading ? <TabSkeleton /> :
            analyticsError   ? <TabError message="Could not load analytics data." /> :
            weaknessesError ? <TabError message="Could not load weakness data." /> :
            analytics        ? <AnalyticsTab analytics={analytics} drillStats={drillStats} weaknesses={weaknesses} /> :
            <TabSkeleton />
          )}

        </div>
      </div>
    </div>
  );
}
