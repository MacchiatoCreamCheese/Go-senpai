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

  return (
    <div className="move-history">
      {moves.map((move, i) => {
        const num = i + 1;
        const isLatest = num === moves.length;
        return (
          <div
            key={num}
            className={`move-history-row${isLatest ? " move-history-row--latest" : ""}`}
          >
            <span className="move-history-num">{num}</span>
            <span className={`stone-dot stone-dot--${move.color === "B" ? "black" : "white"}`} />
            <span>{moveLabel(move, boardSize)}</span>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
