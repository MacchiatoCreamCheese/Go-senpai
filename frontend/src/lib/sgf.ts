// Tiny SGF parser sufficient for tsumego problem setups: SZ, PL, AB, AW.
// Not a general-purpose SGF parser — game trees, branches, comments,
// and most properties are ignored.

import type { Cell } from "./replay";

export interface ProblemSetup {
  size: number;
  toPlay: "B" | "W";
  blackStones: Array<{ row: number; col: number }>;
  whiteStones: Array<{ row: number; col: number }>;
}

/** Parse SGF column letters (a..s, no skip) into 0-indexed coords. */
function parseSgfPoint(s: string): { row: number; col: number } {
  return { col: s.charCodeAt(0) - 97, row: s.charCodeAt(1) - 97 };
}

function findProp(sgf: string, prop: string): string | null {
  const m = sgf.match(new RegExp(`${prop}\\[([^\\]]*)\\]`));
  return m ? m[1] : null;
}

function findAllProp(sgf: string, prop: string): string[] {
  // Match "AB[cb][cc][...]" — capture all bracketed groups attached.
  const out: string[] = [];
  const re = new RegExp(`${prop}((?:\\[[^\\]]*\\])+)`, "g");
  let m;
  while ((m = re.exec(sgf)) !== null) {
    const groups = m[1].match(/\[([^\]]*)\]/g) ?? [];
    for (const g of groups) out.push(g.slice(1, -1));
  }
  return out;
}

export function parseProblemSgf(sgf: string): ProblemSetup {
  const size = parseInt(findProp(sgf, "SZ") ?? "19", 10);
  const toPlay = (findProp(sgf, "PL") ?? "B") === "W" ? "W" : "B";
  const blackStones = findAllProp(sgf, "AB").filter((s) => s.length >= 2).map(parseSgfPoint);
  const whiteStones = findAllProp(sgf, "AW").filter((s) => s.length >= 2).map(parseSgfPoint);
  return { size, toPlay, blackStones, whiteStones };
}

export function setupToBoard(setup: ProblemSetup): Cell[][] {
  const cells: Cell[][] = Array.from({ length: setup.size }, () =>
    Array<Cell>(setup.size).fill(0),
  );
  for (const p of setup.blackStones) cells[p.row][p.col] = 1;
  for (const p of setup.whiteStones) cells[p.row][p.col] = 2;
  return cells;
}
