import { useMemo, useState } from "react";

import type { ReviewMoment } from "../api";
import type { MoveT } from "../types";
import { ConceptBadge } from "./ConceptBadge";
import { GoBoard } from "../GoBoard";
import { renderMarkdown } from "../lib/markdown";
import { boardAtMove, parseCoord } from "../lib/replay";

interface Props {
  moment: ReviewMoment;
  /** Currently scrubbed-to move; used to highlight the active moment. */
  currentMove: number;
  /** Jump the board to the position immediately *before* this move. */
  onShowOnBoard: () => void;
  /** Game data needed to render the inline snippet. */
  boardSize: number;
  moves: MoveT[];
}

const KIND_LABEL: Record<string, string> = {
  blunder: "Blunder",
  mistake: "Mistake",
  inaccuracy: "Inaccuracy",
  good: "Good move",
  excellent: "Excellent",
};

export function MomentCard({ moment, currentMove, onShowOnBoard, boardSize, moves }: Props) {
  const isActive = currentMove === moment.move_number - 1 || currentMove === moment.move_number;
  const kindLabel = KIND_LABEL[moment.kind] ?? moment.kind;
  const lostText =
    moment.points_lost > 0 ? `−${moment.points_lost.toFixed(1)} pts` : "";

  const pv = moment.top_pv ?? [];
  const [pvStep, setPvStep] = useState(0);

  const snapshot = useMemo(
    () => boardAtMove(boardSize, moves, moment.move_number - 1),
    [boardSize, moves, moment.move_number],
  );

  const playedCoord = parseCoord(moment.coord, boardSize);
  const topMoveCoord = parseCoord(moment.top_move ?? null, boardSize);

  // At step 0 the snippet shows the played stone (faint) + ★ on the engine's
  // top move. Stepping forward replaces both with the principal variation.
  const variationToShow = useMemo(() => {
    if (pvStep === 0) return playedCoord ? [playedCoord] : undefined;
    const pts: { row: number; col: number }[] = [];
    for (let i = 0; i < pvStep && i < pv.length; i++) {
      const p = parseCoord(pv[i], boardSize);
      if (p) pts.push(p);
    }
    return pts.length ? pts : undefined;
  }, [pv, pvStep, boardSize, playedCoord]);

  return (
    <article className={"moment-card" + (isActive ? " is-active" : "")}>
      <header className="moment-card-head">
        <span className="moment-card-num">Move {moment.move_number}</span>
        <span className={`moment-card-kind kind-${moment.kind}`}>
          {kindLabel}
          {lostText && <span className="moment-card-lost"> · {lostText}</span>}
        </span>
        <span className="moment-card-coord">
          <span className={`stone-dot ${moment.color === "B" ? "black" : "white"}`} />
          {moment.coord}
          {moment.top_move && moment.top_move !== moment.coord && (
            <span className="moment-card-top">
              <span className="moment-card-arrow">→</span>
              {moment.top_move}
            </span>
          )}
        </span>
      </header>

      <div className="moment-card-row">
        <div className="moment-card-snippet">
          <GoBoard
            board={snapshot.cells}
            vertexSize={11}
            showCoordinates={false}
            disabled
            lastMove={snapshot.last}
            topMove={pvStep === 0 ? topMoveCoord : null}
            variation={variationToShow}
            variationStartColor={moment.color}
          />
          {pv.length > 0 && (
            <div className="moment-card-pv">
              <button
                type="button"
                className="pv-step"
                disabled={pvStep === 0}
                onClick={() => setPvStep((s) => Math.max(0, s - 1))}
                aria-label="Step back"
              >
                ◀
              </button>
              <span className="pv-label">
                {pvStep === 0 ? "played" : `pv ${pvStep}/${pv.length}`}
              </span>
              <button
                type="button"
                className="pv-step"
                disabled={pvStep >= pv.length}
                onClick={() => setPvStep((s) => Math.min(pv.length, s + 1))}
                aria-label="Step forward"
              >
                ▶
              </button>
            </div>
          )}
        </div>

        <div
          className="moment-card-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(moment.explanation_md) }}
        />
      </div>

      {moment.concept_ids.length > 0 && (
        <div className="moment-card-concepts">
          {moment.concept_ids.map((id) => (
            <ConceptBadge key={id} conceptId={id} />
          ))}
        </div>
      )}

      <footer className="moment-card-foot">
        <button type="button" className="link-btn" onClick={onShowOnBoard}>
          Show on board →
        </button>
      </footer>
    </article>
  );
}
