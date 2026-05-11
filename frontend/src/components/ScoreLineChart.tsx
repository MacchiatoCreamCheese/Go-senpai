import { useMemo } from "react";

interface Point {
  move: number;
  /** Black's score lead (positive = black ahead). */
  scoreLead: number;
}

interface Props {
  points: Point[];
  currentMove: number;
  onScrub?: (move: number) => void;
  /** Inline width/height — defaults to fluid. */
  width?: number;
  height?: number;
}

/** Horizontal padding 0 so the plotted line spans the full SVG width (matches range track). */
const PAD = { l: 0, r: 0, t: 10, b: 14 };
const LABEL_INSET = 4;

export function ScoreLineChart({
  points,
  currentMove,
  onScrub,
  width = 560,
  height = 90,
}: Props) {
  const innerW = width - PAD.l - PAD.r;
  const innerH = height - PAD.t - PAD.b;

  const { path, zeroY, maxAbs, lastMove } = useMemo(() => {
    if (points.length === 0) return { path: "", zeroY: PAD.t + innerH / 2, maxAbs: 1, lastMove: 0 };
    const max = Math.max(1, ...points.map((p) => Math.abs(p.scoreLead)));
    const lm = Math.max(...points.map((p) => p.move));
    const x = (m: number) => PAD.l + (lm > 0 ? (m / lm) * innerW : 0);
    const y = (s: number) => PAD.t + innerH / 2 - (s / max) * (innerH / 2);
    const d = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.move).toFixed(2)} ${y(p.scoreLead).toFixed(2)}`)
      .join(" ");
    return { path: d, zeroY: PAD.t + innerH / 2, maxAbs: max, lastMove: lm };
  }, [points, innerW, innerH]);

  // Build vertical band marker for current move position.
  const cursorX = useMemo(() => {
    if (points.length === 0 || lastMove === 0) return PAD.l;
    return PAD.l + (Math.min(currentMove, lastMove) / lastMove) * innerW;
  }, [currentMove, points.length, lastMove, innerW]);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onScrub || lastMove === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const innerWpx = Math.max(1, rect.width);
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / innerWpx));
    onScrub(Math.round(ratio * lastMove));
  }

  if (points.length === 0) {
    return (
      <div className="score-chart score-chart--empty">
        <div className="score-chart-empty">No score data yet.</div>
      </div>
    );
  }

  return (
    <div className="score-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onClick={handleClick}
        style={{ cursor: onScrub ? "crosshair" : "default" }}
        role="img"
        aria-label="Score lead over moves"
      >
        {/* Black-favor zone (above zero) gets a faint warm tint, white-favor below. */}
        <rect x={PAD.l} y={PAD.t} width={innerW} height={zeroY - PAD.t}
              fill="rgba(28, 23, 18, 0.05)" />
        <rect x={PAD.l} y={zeroY} width={innerW} height={innerH - (zeroY - PAD.t)}
              fill="rgba(245, 240, 232, 0.6)" />

        {/* Zero line */}
        <line x1={PAD.l} x2={PAD.l + innerW} y1={zeroY} y2={zeroY}
              stroke="var(--line-dark)" strokeWidth={1} strokeDasharray="2 3" />

        {/* Score curve */}
        <path d={path} fill="none" stroke="var(--seal)" strokeWidth={1.4}
              strokeLinecap="round" strokeLinejoin="round" />

        {/* Current-move cursor */}
        <line x1={cursorX} x2={cursorX} y1={PAD.t} y2={PAD.t + innerH}
              stroke="var(--ink)" strokeWidth={1} />
        <circle cx={cursorX} cy={zeroY} r={2.5} fill="var(--ink)" />

        {/* Axis labels (inset from plot edge; do not shrink plot width) */}
        <text x={LABEL_INSET} y={PAD.t + 8} className="score-chart-axis"
              fontSize="9" fill="var(--stone)">+{maxAbs.toFixed(0)}</text>
        <text x={LABEL_INSET} y={PAD.t + innerH} className="score-chart-axis"
              fontSize="9" fill="var(--stone)">−{maxAbs.toFixed(0)}</text>
      </svg>
    </div>
  );
}
