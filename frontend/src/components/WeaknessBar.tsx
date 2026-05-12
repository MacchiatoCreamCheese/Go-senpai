import type { WeaknessItem } from "../api";

// ── helpers ─────────────────────────────────────────────────────────────────

export function formatWeaknessTheme(theme: string): string {
  return theme.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type WeaknessTier = "critical" | "moderate" | "minor";

export function weaknessTier(severity: number): WeaknessTier {
  if (severity >= 0.65) return "critical";
  if (severity >= 0.35) return "moderate";
  return "minor";
}

// ── Chip (compact) ───────────────────────────────────────────────────────────
// Used in "Focus Areas" on the Overview tab.

interface Props {
  weakness: WeaknessItem;
  compact?: boolean;
}

export function WeaknessBar({ weakness, compact = false }: Props) {
  const tier = weaknessTier(weakness.severity);
  const pct  = Math.round(Math.min(1, Math.max(0, weakness.severity)) * 100);
  const name = formatWeaknessTheme(weakness.theme);

  if (compact) {
    return (
      <div className={`wk-chip wk-chip--${tier}`} title={`Severity: ${pct}/100`}>
        <span className="wk-chip-dot" />
        <span className="wk-chip-label">{name}</span>
        <span className="wk-chip-score">{pct}</span>
      </div>
    );
  }

  const dateStr = formatDate(weakness.last_seen_at);

  return (
    <div className={`wk-card wk-card--${tier}`}>
      <div className="wk-card-header">
        <span className="wk-card-name">{name}</span>
        <span className={`wk-card-badge wk-badge--${tier}`}>{tier}</span>
      </div>
      <div className="wk-card-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="wk-card-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="wk-card-meta">
        <span>{weakness.evidence_count} game{weakness.evidence_count !== 1 ? "s" : ""}</span>
        {dateStr && <span>· last {dateStr}</span>}
        <span className="wk-card-score">{pct}/100</span>
      </div>
    </div>
  );
}
