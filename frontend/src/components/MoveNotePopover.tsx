import { useQuery } from "@tanstack/react-query";
import { getMoveNote, type MoveNote } from "../api";
import { ConceptBadge } from "./ConceptBadge";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  gameId: string;
  moveNumber: number;
  forUserId: string;
  tier: "yellow" | "red";
  onShowOnBoard: () => void;
  onClose: () => void;
}

export function MoveNotePopover({
  gameId,
  moveNumber,
  forUserId,
  tier,
  onShowOnBoard,
  onClose,
}: Props) {
  const note = useQuery<MoveNote, Error>({
    queryKey: ["move-note", gameId, moveNumber, forUserId],
    queryFn: () => getMoveNote(gameId, moveNumber, forUserId),
    staleTime: Infinity,
    retry: false,
  });

  return (
    <div className="move-note-popover" role="dialog" aria-label={`Move ${moveNumber} note`}>
      <div className="move-note-popover-header">
        <span className={`tier-badge tier-badge--${tier}`}>{tier}</span>
        <span className="move-note-popover-title">Move {moveNumber}</span>
        <button
          className="move-note-popover-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {note.isLoading && (
        <div className="move-note-popover-body dim">Generating note…</div>
      )}
      {note.isError && (
        <div className="move-note-popover-body dim">Couldn't load note.</div>
      )}
      {note.data && (
        <>
          <div
            className="move-note-popover-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(note.data.body_md) }}
          />
          {note.data.concept_ids.length > 0 && (
            <div className="move-note-popover-concepts">
              {note.data.concept_ids.map((id) => (
                <ConceptBadge key={id} conceptId={id} />
              ))}
            </div>
          )}
          <button className="btn btn-ghost move-note-show-board" onClick={onShowOnBoard}>
            Show on board
          </button>
        </>
      )}
    </div>
  );
}
