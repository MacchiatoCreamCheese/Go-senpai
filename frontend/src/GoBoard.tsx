import type { GameStateT, PointT } from "./types";
import type { Cell } from "./lib/replay";
import { useSettings } from "./lib/settings";

export interface GhostStone {
  sign: 1 | -1;
  type: string;
  faint: boolean;
}

interface Props {
  state?: GameStateT;
  /** Direct signMap (-1/0/1). When supplied, overrides state.board. */
  signMap?: number[][];
  /** 0=empty 1=black 2=white grid (alternative to signMap). */
  board?: Cell[][];
  onPlay?: (point: PointT) => void;
  disabled?: boolean;
  /** When disabled, still capture clicks on empty points (e.g. human game waiting for opponent). */
  onBlockedPlay?: () => void;
  /** Fixed pixel width (and height) of the board. When set, cell size is derived from it.
   *  Takes priority over vertexSize. Default: 520. */
  width?: number;
  /** Cell size in px. Only used when `width` is not provided (legacy / thumbnail boards). */
  vertexSize?: number;
  showCoordinates?: boolean;
  /** Last placed stone — drawn as a small circle marker. */
  lastMove?: { row: number; col: number } | null;
  /** Top engine move — drawn as a yellow star label. */
  topMove?: { row: number; col: number } | null;
  /** Variation: ghost stones with alternating colours starting at startColor. */
  variation?: { row: number; col: number }[];
  variationStartColor?: "B" | "W";
  /** Optional heat overlay (unused in SVG renderer, kept for API compat). */
  heatMap?: ({ strength: number; text?: string } | null)[][];
  /** Territory ghost stones from KataGo ownership (live game only). */
  ownershipGhosts?: (GhostStone | null)[][];
}

const STARS_9  = [[2,2],[2,6],[6,2],[6,6],[4,4]];
const STARS_13 = [[3,3],[3,9],[9,3],[9,9],[6,6]];
const STARS_19 = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];

function toSignMap(board: number[][]): number[][] {
  return board.map((row) => row.map((c) => (c === 1 ? 1 : c === 2 ? -1 : 0)));
}

export function GoBoard({
  state,
  signMap: signMapProp,
  board,
  onPlay,
  disabled,
  onBlockedPlay,
  width,
  vertexSize,
  showCoordinates,
  lastMove,
  topMove,
  variation,
  variationStartColor = "B",
  ownershipGhosts,
}: Props) {
  const [settings] = useSettings();
  const coords = showCoordinates ?? settings.showCoordinates;

  const signMap: number[][] = signMapProp
    ? signMapProp
    : board
      ? toSignMap(board)
      : state
        ? toSignMap(state.board)
        : [];

  const size = signMap.length || 19;
  const pad = coords ? 28 : 20;
  // Fixed-width mode (default): board always renders at `width` px regardless of board size.
  // vertexSize mode (legacy thumbnails): cell size is fixed, board grows with board size.
  const W = width !== undefined ? width : vertexSize !== undefined ? vertexSize * (size - 1) + pad * 2 : 520;
  const cell = (W - pad * 2) / (size - 1);
  const H = W;
  const px = (i: number) => pad + i * cell;
  const stars = size === 9 ? STARS_9 : size === 13 ? STARS_13 : STARS_19;

  // Build variation ghost map
  const varGhosts: ({ sign: 1 | -1 } | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );
  if (variation && variation.length > 0) {
    let sign: 1 | -1 = variationStartColor === "B" ? 1 : -1;
    for (const v of variation) {
      if (v.row >= 0 && v.row < size && v.col >= 0 && v.col < size) {
        varGhosts[v.row][v.col] = { sign };
        sign = sign === 1 ? -1 : 1;
      }
    }
  }

  const hasVariation = variation && variation.length > 0;

  return (
    <div className="board-container">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{
          display: "block",
          cursor: disabled && onBlockedPlay ? "pointer" : disabled ? "default" : "crosshair",
        }}
      >
        {/* board background */}
        <rect x="0" y="0" width={W} height={H}
          fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="2.5" rx="10" />

        {/* ownership wash (when no variation) */}
        {!hasVariation && ownershipGhosts && ownershipGhosts.length === size &&
          ownershipGhosts.flatMap((row, y) =>
            row.map((g, x) => {
              if (!g) return null;
              const isBlack = g.sign === 1;
              const alpha = g.faint ? 0.25 : 0.45;
              return (
                <rect key={`ow${y}_${x}`}
                  x={px(x) - cell / 2} y={px(y) - cell / 2}
                  width={cell} height={cell}
                  fill={isBlack ? `rgba(26,23,20,${alpha})` : `rgba(255,255,255,${alpha})`}
                />
              );
            })
          )
        }

        {/* grid lines */}
        {Array.from({ length: size }).map((_, i) => (
          <line key={`h${i}`} x1={px(0)} y1={px(i)} x2={px(size-1)} y2={px(i)}
            stroke="var(--ink)" strokeWidth="1.25" />
        ))}
        {Array.from({ length: size }).map((_, i) => (
          <line key={`v${i}`} x1={px(i)} y1={px(0)} x2={px(i)} y2={px(size-1)}
            stroke="var(--ink)" strokeWidth="1.25" />
        ))}

        {/* star points */}
        {stars.map(([sx, sy], i) => (
          <circle key={`s${i}`} cx={px(sx)} cy={px(sy)} r="2.5" fill="var(--ink)" />
        ))}

        {/* coordinates */}
        {coords && Array.from({ length: size }).map((_, i) => (
          <g key={`c${i}`} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-mute)">
            <text x={px(i)} y={pad - 10} textAnchor="middle">{"ABCDEFGHJKLMNOPQRST"[i]}</text>
            <text x={pad - 10} y={px(i) + 3} textAnchor="end">{size - i}</text>
          </g>
        ))}

        {/* stones from signMap */}
        {signMap.flatMap((row, y) =>
          row.map((sign, x) => {
            if (sign === 0) return null;
            const isBlack = sign === 1;
            const r = cell * 0.44;
            const cx = px(x);
            const cy = px(y);
            const isLast = lastMove?.row === y && lastMove?.col === x;
            const isTop = topMove?.row === y && topMove?.col === x;
            return (
              <g key={`st${y}_${x}`}>
                <circle cx={cx} cy={cy} r={r}
                  fill={isBlack ? "var(--ink)" : "var(--bg-2)"}
                  stroke="var(--ink)" strokeWidth="2" />
                {isLast && (
                  <circle cx={cx} cy={cy} r={r * 0.35}
                    fill={isBlack ? "var(--bg-2)" : "var(--ink)"} />
                )}
                {isTop && (
                  <g>
                    <circle cx={cx} cy={cy} r={r * 0.62}
                      fill="var(--pastel-yellow)" stroke="var(--ink)" strokeWidth="1.5" />
                    <text x={cx} y={cy + 4} textAnchor="middle"
                      fontFamily="var(--font-display)" fontWeight="700"
                      fontSize={cell * 0.34} fill="var(--ink)">★</text>
                  </g>
                )}
              </g>
            );
          })
        )}

        {/* variation ghost stones */}
        {hasVariation && varGhosts.flatMap((row, y) =>
          row.map((g, x) => {
            if (!g) return null;
            const r = cell * 0.44;
            const cx = px(x);
            const cy = px(y);
            const isBlack = g.sign === 1;
            // only show ghost if cell is empty
            if (signMap[y]?.[x] !== 0) return null;
            return (
              <circle key={`vg${y}_${x}`} cx={cx} cy={cy} r={r}
                fill={isBlack ? "rgba(26,23,20,0.45)" : "rgba(255,255,255,0.45)"}
                stroke="var(--ink)" strokeWidth="1.5"
                strokeDasharray="3 3" />
            );
          })
        )}

        {/* click hit areas — blocked (waiting) */}
        {disabled && onBlockedPlay &&
          signMap.flatMap((row, y) =>
            row.map((sign, x) => {
              if (sign !== 0) return null;
              return (
                <rect
                  key={`blocked${y}_${x}`}
                  x={px(x) - cell / 2}
                  y={px(y) - cell / 2}
                  width={cell}
                  height={cell}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => onBlockedPlay()}
                />
              );
            }),
          )}
        {/* normal play */}
        {!disabled &&
          onPlay &&
          signMap.flatMap((row, y) =>
            row.map((_sign, x) => (
              <rect
                key={`hit${y}_${x}`}
                x={px(x) - cell / 2}
                y={px(y) - cell / 2}
                width={cell}
                height={cell}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => onPlay({ row: y, col: x })}
              />
            )),
          )}
      </svg>
    </div>
  );
}
