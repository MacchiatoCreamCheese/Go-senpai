import type { ReviewMoment } from "../api";
import { ConceptBadge } from "./ConceptBadge";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  moment: ReviewMoment;
  /** Currently scrubbed-to move; used to highlight the active moment. */
  currentMove: number;
  /** Jump the board to the position immediately *before* this move. */
  onShowOnBoard: () => void;
}

const KIND_LABEL: Record<string, string> = {
  blunder: "Blunder",
  mistake: "Mistake",
  inaccuracy: "Inaccuracy",
  good: "Good move",
  excellent: "Excellent",
};

export function MomentCard({ moment, currentMove, onShowOnBoard }: Props) {
  const isActive = currentMove === moment.move_number - 1 || currentMove === moment.move_number;
  const kindLabel = KIND_LABEL[moment.kind] ?? moment.kind;
  const lostText =
    moment.points_lost > 0 ? `−${moment.points_lost.toFixed(1)} pts` : "";

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

      <div
        className="moment-card-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(moment.explanation_md) }}
      />

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
