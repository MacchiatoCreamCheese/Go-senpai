import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { getMyGames, getUserConcepts, getUserProgress, getWeaknesses } from "../api";
import { WeaknessBar } from "../components/WeaknessBar";
import { HandleEditor } from "../components/HandleEditor";
import { useAuth, useIdentity } from "../lib/auth";
import {
  enrichMatches,
  toConceptProgress,
  buildAnalytics,
  deriveProfileStats,
  getBookmarkedConceptIds,
} from "../services/profileService";
import { avatarColor, deriveMockRank } from "../data/mockProfile";
import type { EnrichedMatch, ConceptProgressItem, WeeklySeries, HistoryFilter } from "../types/profile";

// ─── Tiny helpers ──────────────────────────────────────────────────────────────

function fmt(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtShort(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtWk(week: string) {
  return week.replace(/^\d{4}-W/, "W");
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
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
  const PAD = { l: 4, r: 4, t: 8, b: 4 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;

  if (data.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block" }}>
        <line x1={PAD.l} x2={W - PAD.r} y1={H / 2} y2={H / 2}
          stroke="var(--line)" strokeDasharray="3 4" strokeWidth="1.2" />
      </svg>
    );
  }

  const max = Math.max(1, ...data.map(d => d.value));
  const min = 0;
  const range = max - min;
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * iW;
  const y = (v: number) => PAD.t + iH - ((v - min) / range) * iH;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${(PAD.t + iH).toFixed(1)} L ${PAD.l} ${(PAD.t + iH).toFixed(1)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }}>
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
  data: WeeklySeries[];
  strokeColor: string;
  fillColor: string;
  unit?: string;
}) {
  const latest = data.length > 0 ? data[data.length - 1].value : 0;
  const prev = data.length > 1 ? data[data.length - 2].value : latest;
  const delta = latest - prev;
  const fillId = `grad-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const weekLabels = data.slice(-5);

  return (
    <div className="prf-chart-block">
      <div className="prf-chart-header">
        <span className="prf-chart-label">{label}</span>
        <span className="prf-chart-latest">
          {latest % 1 === 0 ? latest : latest.toFixed(1)}{unit}
          {delta !== 0 && (
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
          <span key={d.week} style={{ left: `${(i / Math.max(weekLabels.length - 1, 1)) * 100}%` }}>
            {fmtWk(d.week)}
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
}: {
  games: EnrichedMatch[];
  concepts: ConceptProgressItem[];
  weaknesses: ReturnType<typeof getWeaknesses> extends Promise<infer T> ? T : never;
}) {
  const bookmarks = useMemo(() => getBookmarkedConceptIds(), []);
  const recentGames = games.slice(0, 4);
  const topWeaknesses = (weaknesses ?? []).slice().sort((a, b) => b.severity - a.severity).slice(0, 3);
  const bookmarkedConcepts = concepts.filter(c => bookmarks.has(c.conceptId));
  const lastStudied = concepts.length > 0
    ? [...concepts].sort((a, b) =>
        (b.lastTaughtAt ?? "").localeCompare(a.lastTaughtAt ?? "")
      )[0]
    : null;

  return (
    <div className="prf-overview">

      {/* Continue learning card */}
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

        {/* Recent games */}
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
                    <span className={`prf-color-dot ${g.playerColor === "B" ? "black" : "white"}`} />
                    <span className="prf-activity-opp">{g.opponentHandle}</span>
                    <ResultChip match={g} />
                    <span className="prf-activity-meta">{g.boardSize}×{g.boardSize} · {fmtShort(g.startedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="" className="prf-see-all" data-tab="history">See all games →</Link>
        </section>

        {/* Focus areas */}
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

      {/* Saved concepts */}
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
    { id: "all",   label: "All" },
    { id: "wins",  label: "Wins" },
    { id: "losses",label: "Losses" },
    { id: "ai",    label: "vs AI" },
    { id: "human", label: "vs Human" },
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
                <span className={`prf-color-dot ${g.playerColor === "B" ? "black" : "white"}`} title={`Played as ${g.playerColor === "B" ? "Black" : "White"}`} />
                <span className="prf-history-board">{g.boardSize}×{g.boardSize}</span>
                <span className="prf-history-opp">
                  {g.opponentType === "ai" && <span className="prf-ai-badge">先</span>}
                  {g.opponentHandle}
                </span>
                {g.opening && <span className="prf-history-opening">{g.opening}</span>}
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
      {/* Summary row */}
      <div className="prf-cncpt-summary">
        <button
          className={`prf-cncpt-stat${stateFilter === "all" ? " is-active" : ""}`}
          onClick={() => setStateFilter("all")}
        >
          <span className="prf-cncpt-stat-n">{concepts.length}</span>
          <span className="prf-cncpt-stat-l">Total</span>
        </button>
        <button
          className={`prf-cncpt-stat${stateFilter === "viewed" ? " is-active" : ""}`}
          onClick={() => setStateFilter("viewed")}
        >
          <span className="prf-cncpt-stat-n">{counts.viewed}</span>
          <span className="prf-cncpt-stat-l">Viewed</span>
        </button>
        <button
          className={`prf-cncpt-stat${stateFilter === "practicing" ? " is-active" : ""}`}
          onClick={() => setStateFilter("practicing")}
        >
          <span className="prf-cncpt-stat-n" style={{ color: "var(--tier-ok)" }}>{counts.practicing}</span>
          <span className="prf-cncpt-stat-l">Practicing</span>
        </button>
        <button
          className={`prf-cncpt-stat${stateFilter === "mastered" ? " is-active" : ""}`}
          onClick={() => setStateFilter("mastered")}
        >
          <span className="prf-cncpt-stat-n" style={{ color: "var(--tier-good)" }}>{counts.mastered}</span>
          <span className="prf-cncpt-stat-l">Mastered</span>
        </button>
      </div>

      {/* Search toolbar */}
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
  weaknesses,
}: {
  analytics: ReturnType<typeof buildAnalytics>;
  weaknesses: Awaited<ReturnType<typeof getWeaknesses>>;
}) {
  const maxConceptCount = Math.max(1, ...analytics.topStudiedConcepts.map(c => c.count));

  return (
    <div className="prf-analytics">

      {/* Summary stats */}
      <div className="prf-analytics-summary">
        <div className="prf-an-stat">
          <span className="prf-an-stat-value">{pct(analytics.puzzleAccuracy)}</span>
          <span className="prf-an-stat-label">Puzzle accuracy</span>
        </div>
        <div className="prf-an-stat">
          <span className="prf-an-stat-value">{analytics.avgStudyMinutesPerWeek}m</span>
          <span className="prf-an-stat-label">Avg study / week</span>
        </div>
        <div className="prf-an-stat">
          <span className="prf-an-stat-value">
            {(analytics.gamesPerWeek[analytics.gamesPerWeek.length - 1]?.value ?? 0).toFixed(1)}
          </span>
          <span className="prf-an-stat-label">Games this week</span>
        </div>
        <div className="prf-an-stat">
          <span className="prf-an-stat-value">
            {(analytics.drillsPerWeek[analytics.drillsPerWeek.length - 1]?.value ?? 0).toFixed(0)}
          </span>
          <span className="prf-an-stat-label">Drills this week</span>
        </div>
      </div>

      {/* Charts */}
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
          unit=""
        />
      </div>

      {/* Top studied concepts */}
      {analytics.topStudiedConcepts.length > 0 && (
        <section className="prf-analytics-section">
          <h3 className="prf-analytics-heading">Most Studied Concepts</h3>
          <div className="prf-top-concepts">
            {analytics.topStudiedConcepts.map(c => (
              <div key={c.title} className="prf-top-concept-row">
                <span className="prf-top-concept-title">{c.title}</span>
                <div className="prf-top-concept-bar-wrap">
                  <div
                    className="prf-top-concept-bar"
                    style={{ width: `${(c.count / maxConceptCount) * 100}%` }}
                  />
                </div>
                <span className="prf-top-concept-count">{c.count}×</span>
              </div>
            ))}
          </div>
        </section>
      )}

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

export default function Profile() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const { profile, legacy } = useAuth();
  const { userId: meId, displayName: meHandle } = useIdentity();
  const userId = paramId ?? meId;
  const isMe = !paramId || paramId === meId;
  const handle = (isMe ? meHandle : null) ?? userId?.slice(0, 8) ?? "Player";

  const [tab, setTab] = useState<TabId>("overview");

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: rawGames = [], isLoading: gamesLoading } = useQuery({
    queryKey: ["my-games", userId],
    queryFn: () => (userId ? getMyGames(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const { data: weaknesses = [] } = useQuery({
    queryKey: ["weaknesses", userId],
    queryFn: () => (userId ? getWeaknesses(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const { data: rawConcepts = [], isLoading: conceptsLoading } = useQuery({
    queryKey: ["user-concepts", userId],
    queryFn: () => (userId ? getUserConcepts(userId) : Promise.resolve([])),
    enabled: !!userId && (tab === "concepts" || tab === "overview" || tab === "analytics"),
  });

  const { data: rawProgress = { games_per_week: [], drills_per_week: [], top_weakness_severity_history: [] } } =
    useQuery({
      queryKey: ["user-progress", userId],
      queryFn: () =>
        userId
          ? getUserProgress(userId)
          : Promise.resolve({ games_per_week: [], drills_per_week: [], top_weakness_severity_history: [] }),
      enabled: !!userId && tab === "analytics",
    });

  // ── Derived data ─────────────────────────────────────────────────────────────

  const games      = useMemo(() => enrichMatches(rawGames), [rawGames]);
  const concepts   = useMemo(() => toConceptProgress(rawConcepts), [rawConcepts]);
  const analytics  = useMemo(() => buildAnalytics(rawProgress, rawGames, rawConcepts), [rawProgress, rawGames, rawConcepts]);
  const stats      = useMemo(() => deriveProfileStats(rawGames, rawConcepts), [rawGames, rawConcepts]);

  // ── Early exits ──────────────────────────────────────────────────────────────

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

  // ── Avatar ───────────────────────────────────────────────────────────────────

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
                {stats.totalGames} game{stats.totalGames !== 1 ? "s" : ""} played
                {stats.winRate !== null && ` · ${pct(stats.winRate)} win rate`}
              </div>
              {isMe && !legacy && profile && (
                <div className="prf-handle-editor">
                  <HandleEditor />
                </div>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="prf-stats-row">
            <StatBlock label="Games" value={stats.totalGames.toString()} />
            <StatBlock
              label="Win rate"
              value={stats.winRate !== null ? pct(stats.winRate) : "—"}
              sub={stats.finishedGames > 0 ? `${stats.finishedGames} finished` : undefined}
            />
            <StatBlock label="Concepts" value={stats.totalConcepts.toString()} />
            <StatBlock
              label="Puzzle accuracy"
              value={pct(analytics.puzzleAccuracy)}
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
              aria-selected={tab === t.id}
              className={`prf-tab${tab === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Tab content ──────────────────────────────────────────── */}
      <div className="prf-body">
        <div className="prf-body-inner">

          {tab === "overview" && (
            <OverviewTab
              games={games}
              concepts={concepts}
              weaknesses={weaknesses}
            />
          )}

          {tab === "history" && (
            gamesLoading ? (
              <div className="prf-loading">Loading games…</div>
            ) : (
              <HistoryTab games={games} />
            )
          )}

          {tab === "concepts" && (
            conceptsLoading ? (
              <div className="prf-loading">Loading concepts…</div>
            ) : (
              <ConceptsTab concepts={concepts} />
            )
          )}

          {tab === "analytics" && (
            <AnalyticsTab analytics={analytics} weaknesses={weaknesses} />
          )}

        </div>
      </div>
    </div>
  );
}
