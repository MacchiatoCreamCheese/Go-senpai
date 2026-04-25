import type { WeaknessItem } from "../api";

interface Props {
  weakness: WeaknessItem;
  /** Compact = single-line, no last-seen meta. */
  compact?: boolean;
}

function formatTheme(theme: string): string {
  return theme.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function WeaknessBar({ weakness, compact = false }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, weakness.severity)) * 100);
  return (
    <div className={"weakness-bar" + (compact ? " is-compact" : "")} title={weakness.theme}>
      <div className="weakness-bar-head">
        <span className="weakness-bar-name">{formatTheme(weakness.theme)}</span>
        <span className="weakness-bar-sev">{(weakness.severity).toFixed(2)}</span>
      </div>
      <div className="weakness-bar-track">
        <div
          className="weakness-bar-fill"
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
      {!compact && (
        <div className="weakness-bar-meta">
          <span>seen in {weakness.evidence_count} game{weakness.evidence_count === 1 ? "" : "s"}</span>
          <span>last {formatDate(weakness.last_seen_at)}</span>
        </div>
      )}
    </div>
  );
}
