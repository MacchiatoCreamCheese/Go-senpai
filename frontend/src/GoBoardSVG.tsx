interface Stone {
  x: number;
  y: number;
  c: "b" | "w";
  num?: number;
  tier?: "good" | "ok" | "bad";
  letter?: string;
  letterBg?: string;
  ghost?: boolean;
}

interface GoBoardSVGProps {
  size?: 9 | 13 | 19;
  stones?: Stone[];
  showCoords?: boolean;
  width?: number;
  ownership?: number[][] | null;
  highlight?: { x: number; y: number; color?: string } | null;
  pad?: number;
  bg?: string;
}

const STARS_9 = [[2,2],[2,6],[6,2],[6,6],[4,4]];
const STARS_13 = [[3,3],[3,9],[9,3],[9,9],[6,6]];
const STARS_19 = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];

export function GoBoardSVG({
  size = 9,
  stones = [],
  showCoords = false,
  width = 420,
  ownership = null,
  highlight = null,
  pad = 24,
  bg = "var(--bg-2)",
}: GoBoardSVGProps) {
  const cell = (width - pad * 2) / (size - 1);
  const W = width;
  const H = width;
  const stars = size === 9 ? STARS_9 : size === 13 ? STARS_13 : STARS_19;
  const px = (i: number) => pad + i * cell;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* board background */}
      <rect x="0" y="0" width={W} height={H} fill={bg} stroke="var(--ink)" strokeWidth="2.5" rx="10" />

      {/* ownership wash */}
      {ownership && ownership.flat().map((v, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const a = Math.min(0.55, Math.abs(v));
        const c = v >= 0 ? "rgba(26,23,20," : "rgba(255,255,255,";
        return (
          <rect key={`o${i}`}
            x={px(x) - cell / 2} y={px(y) - cell / 2}
            width={cell} height={cell}
            fill={`${c}${a})`}
          />
        );
      })}

      {/* grid lines */}
      {Array.from({ length: size }).map((_, i) => (
        <line key={`h${i}`} x1={px(0)} y1={px(i)} x2={px(size - 1)} y2={px(i)}
          stroke="var(--ink)" strokeWidth="1.25" />
      ))}
      {Array.from({ length: size }).map((_, i) => (
        <line key={`v${i}`} x1={px(i)} y1={px(0)} x2={px(i)} y2={px(size - 1)}
          stroke="var(--ink)" strokeWidth="1.25" />
      ))}

      {/* star points */}
      {stars.map(([x, y], i) => (
        <circle key={`s${i}`} cx={px(x)} cy={px(y)} r="2.5" fill="var(--ink)" />
      ))}

      {/* coordinates */}
      {showCoords && Array.from({ length: size }).map((_, i) => (
        <g key={`c${i}`} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-mute)">
          <text x={px(i)} y={pad - 8} textAnchor="middle">{"ABCDEFGHJKLMNOPQRST"[i]}</text>
          <text x={pad - 10} y={px(i) + 3} textAnchor="end">{size - i}</text>
        </g>
      ))}

      {/* highlight square */}
      {highlight && (
        <rect
          x={px(highlight.x) - cell / 2 + 2} y={px(highlight.y) - cell / 2 + 2}
          width={cell - 4} height={cell - 4}
          fill="none" stroke={highlight.color || "var(--border-deep)"} strokeWidth="2.5" rx="4"
          strokeDasharray="3 3"
        />
      )}

      {/* stones */}
      {stones.map((s, i) => {
        const r = cell * 0.45;
        const cx = px(s.x);
        const cy = px(s.y);
        if (s.ghost) {
          return (
            <circle key={`st${i}`} cx={cx} cy={cy} r={r}
              fill="none" stroke="var(--ink)" strokeWidth="1.5"
              strokeDasharray="3 3" opacity="0.6" />
          );
        }
        return (
          <g key={`st${i}`}>
            <circle cx={cx} cy={cy} r={r}
              fill={s.c === "b" ? "var(--ink)" : "var(--bg-2)"}
              stroke="var(--ink)" strokeWidth="2" />
            {s.num !== undefined && (
              <text x={cx} y={cy + 3.5} textAnchor="middle"
                fontFamily="var(--font-display)" fontWeight="600"
                fontSize={cell * 0.36}
                fill={s.c === "b" ? "var(--bg-2)" : "var(--ink)"}>
                {s.num}
              </text>
            )}
            {s.tier && (
              <circle
                cx={cx + r * 0.8} cy={cy - r * 0.8} r={cell * 0.14}
                fill={
                  s.tier === "good" ? "var(--tier-good)"
                  : s.tier === "ok" ? "var(--tier-ok)"
                  : "var(--tier-bad)"
                }
                stroke="var(--ink)" strokeWidth="1.5"
              />
            )}
            {s.letter && (
              <g>
                <circle cx={cx} cy={cy} r={r * 0.62}
                  fill={s.letterBg || "var(--pastel-yellow)"}
                  stroke="var(--ink)" strokeWidth="1.5" />
                <text x={cx} y={cy + 4} textAnchor="middle"
                  fontFamily="var(--font-display)" fontWeight="700"
                  fontSize={cell * 0.34} fill="var(--ink)">
                  {s.letter}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
