import { useEffect, useRef } from "react";
import type { MoveT } from "../types";

const COLS = "ABCDEFGHJKLMNOPQRST";

function moveLabel(move: MoveT, size: number): string {
  if (move.kind === "pass") return "pass";
  if (move.kind === "resign") return "resign";
  if (!move.point) return "?";
  return COLS[move.point.col] + (size - move.point.row);
}

interface Props {
  moves: MoveT[];
  boardSize: number;
}

export function MoveHistory({ moves, boardSize }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moves.length]);

  if (moves.length === 0) return null;

  // Pair moves: [black, white] per row
  const pairs: [MoveT, number, MoveT | null, number][] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push([moves[i], i + 1, moves[i + 1] ?? null, i + 2]);
  }

  return (
    <div className="move-history">
      {pairs.map(([black, bNum, white, wNum]) => (
        <div key={bNum} className="move-history-pair">
          <div
            className={`move-history-cell${bNum === moves.length ? " move-history-cell--latest" : ""}`}
          >
            <span className="move-history-num">{bNum}.</span>
            <span className="stone-dot stone-dot--black" />
            <span>{moveLabel(black, boardSize)}</span>
          </div>
          {white && (
            <div
              className={`move-history-cell${wNum === moves.length ? " move-history-cell--latest" : ""}`}
            >
              <span className="move-history-num">{wNum}.</span>
              <span className="stone-dot stone-dot--white" />
              <span>{moveLabel(white, boardSize)}</span>
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
