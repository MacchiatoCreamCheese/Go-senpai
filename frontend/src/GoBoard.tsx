import { Goban } from "@sabaki/shudan";
import "@sabaki/shudan/css/goban.css";
import type { GhostStone, VertexMarker } from "@sabaki/shudan";

import type { GameStateT, PointT } from "./types";
import type { Cell } from "./lib/replay";
import { useSettings } from "./lib/settings";

interface Props {
  state?: GameStateT;
  /** Direct signMap (-1/0/1). When supplied, overrides state.board. */
  signMap?: number[][];
  /** 0=empty 1=black 2=white grid (alternative to signMap). */
  board?: Cell[][];
  onPlay?: (point: PointT) => void;
  disabled?: boolean;
  vertexSize?: number;
  showCoordinates?: boolean;
  /** Last placed stone — drawn as a small circle marker. */
  lastMove?: { row: number; col: number } | null;
  /** Top engine move — drawn as a square marker. */
  topMove?: { row: number; col: number } | null;
  /** Variation: ghost stones with alternating colours starting at startColor. */
  variation?: { row: number; col: number }[];
  variationStartColor?: "B" | "W";
  /** Optional heat overlay (used for ownership when available). */
  heatMap?: ({ strength: number; text?: string } | null)[][];
}

function toSignMap(board: number[][]): number[][] {
  return board.map((row) => row.map((cell) => (cell === 1 ? 1 : cell === 2 ? -1 : 0)));
}

function emptyMarkerMap(size: number): (VertexMarker | null)[][] {
  return Array.from({ length: size }, () => Array<VertexMarker | null>(size).fill(null));
}

function emptyGhostMap(size: number): (GhostStone | null)[][] {
  return Array.from({ length: size }, () => Array<GhostStone | null>(size).fill(null));
}

export function GoBoard({
  state,
  signMap: signMapProp,
  board,
  onPlay,
  disabled,
  vertexSize = 28,
  showCoordinates,
  lastMove,
  topMove,
  variation,
  variationStartColor = "B",
  heatMap,
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
  const size = signMap.length;

  // Markers
  const markers = emptyMarkerMap(size);
  if (lastMove && size) {
    markers[lastMove.row][lastMove.col] = { type: "point" };
  }
  if (topMove && size) {
    markers[topMove.row][topMove.col] = { type: "label", label: "★" };
  }

  // Variation ghost stones
  const ghosts = emptyGhostMap(size);
  if (variation && size) {
    let sign: 1 | -1 = variationStartColor === "B" ? 1 : -1;
    for (const v of variation) {
      ghosts[v.row][v.col] = { sign, type: "good", faint: true };
      sign = (sign === 1 ? -1 : 1) as 1 | -1;
    }
  }

  return (
    <div className="board-container">
      <Goban
        vertexSize={vertexSize}
        signMap={signMap}
        markerMap={markers}
        ghostStoneMap={ghosts}
        heatMap={heatMap}
        showCoordinates={coords}
        busy={disabled}
        onVertexClick={(_evt, [x, y]) => {
          if (!onPlay || disabled) return;
          onPlay({ row: y, col: x });
        }}
      />
    </div>
  );
}
