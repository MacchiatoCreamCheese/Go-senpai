import { Goban } from "@sabaki/shudan";
import "@sabaki/shudan/css/goban.css";

import type { GameStateT, PointT } from "./types";

interface Props {
  state: GameStateT;
  onPlay?: (point: PointT) => void;
  disabled?: boolean;
}

// Our engine encodes stones as 0=empty, 1=black, 2=white. Shudan uses 1=black,
// -1=white, 0=empty. Convert row-major.
function toSignMap(board: number[][]): number[][] {
  return board.map((row) => row.map((cell) => (cell === 1 ? 1 : cell === 2 ? -1 : 0)));
}

export function GoBoard({ state, onPlay, disabled }: Props) {
  const signMap = toSignMap(state.board);
  return (
    <Goban
      vertexSize={28}
      signMap={signMap}
      showCoordinates
      busy={disabled}
      onVertexClick={(_evt, [x, y]) => {
        if (!onPlay || disabled) return;
        onPlay({ row: y, col: x });
      }}
    />
  );
}
