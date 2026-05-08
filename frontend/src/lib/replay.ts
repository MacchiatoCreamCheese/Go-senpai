import type { MoveT } from "../types";

export type Cell = 0 | 1 | 2; // 0 empty · 1 black · 2 white

const COLS = "ABCDEFGHJKLMNOPQRST"; // 'I' skipped, KataGo/SGF convention

export interface ReplayBoard {
  cells: Cell[][];
  captures: { B: number; W: number };
  /** Most recent placed stone (for last-move marker), null for pass/resign/empty. */
  last: { row: number; col: number } | null;
}

function emptyBoard(size: number): Cell[][] {
  return Array.from({ length: size }, () => Array<Cell>(size).fill(0));
}

function inBounds(size: number, r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < size && c < size;
}

/** Flood-fill the connected group of `colour` containing (r,c); returns
 *  the stones in the group and the set of liberty intersections. */
function group(
  board: Cell[][],
  size: number,
  r: number,
  c: number,
): { stones: Array<[number, number]>; liberties: number } {
  const colour = board[r][c];
  const seen = new Set<number>();
  const stones: Array<[number, number]> = [];
  const libs = new Set<number>();
  const stack: Array<[number, number]> = [[r, c]];
  while (stack.length) {
    const [y, x] = stack.pop()!;
    const key = y * size + x;
    if (seen.has(key)) continue;
    seen.add(key);
    stones.push([y, x]);
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const ny = y + dy;
      const nx = x + dx;
      if (!inBounds(size, ny, nx)) continue;
      const nv = board[ny][nx];
      if (nv === 0) libs.add(ny * size + nx);
      else if (nv === colour) stack.push([ny, nx]);
    }
  }
  return { stones, liberties: libs.size };
}

/** Replay moves[0..n) and return the resulting board + capture totals. */
export function boardAtMove(
  size: number,
  moves: MoveT[],
  n: number,
): ReplayBoard {
  const cells = emptyBoard(size);
  const captures = { B: 0, W: 0 };
  let last: ReplayBoard["last"] = null;
  const upto = Math.min(Math.max(n, 0), moves.length);

  for (let i = 0; i < upto; i++) {
    const m = moves[i];
    if (m.kind !== "play" || !m.point) {
      last = null;
      continue;
    }
    const { row, col } = m.point;
    const me: Cell = m.color === "B" ? 1 : 2;
    const opp: Cell = me === 1 ? 2 : 1;
    cells[row][col] = me;
    last = { row, col };

    // Capture opponent groups with no liberties.
    for (const [dy, dx] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const ny = row + dy;
      const nx = col + dx;
      if (!inBounds(size, ny, nx)) continue;
      if (cells[ny][nx] !== opp) continue;
      const g = group(cells, size, ny, nx);
      if (g.liberties === 0) {
        for (const [y, x] of g.stones) cells[y][x] = 0;
        if (m.color === "B") captures.B += g.stones.length;
        else captures.W += g.stones.length;
      }
    }

    // Suicide (rare; pre-validated server-side, but stay safe).
    const own = group(cells, size, row, col);
    if (own.liberties === 0) {
      for (const [y, x] of own.stones) cells[y][x] = 0;
    }
  }

  return { cells, captures, last };
}

/** Convert a KataGo/SGF coord like "Q16" or "pass" to {row, col} on a board
 *  of `size`. Returns null for pass/resign. */
export function parseCoord(coord: string | null | undefined, size: number): { row: number; col: number } | null {
  if (!coord) return null;
  if (coord === "pass" || coord === "resign") return null;
  const colIdx = COLS.indexOf(coord[0].toUpperCase());
  if (colIdx < 0) return null;
  const rowNum = parseInt(coord.slice(1), 10);
  if (Number.isNaN(rowNum)) return null;
  return { row: size - rowNum, col: colIdx };
}

/** Inverse: {row,col} → "Q16". */
export function formatCoord(row: number, col: number, size: number): string {
  return `${COLS[col]}${size - row}`;
}
