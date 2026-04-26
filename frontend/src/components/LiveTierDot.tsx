import { useState } from "react";
import { MoveNotePopover } from "./MoveNotePopover";

type Tier = "green" | "yellow" | "red";

interface Props {
  gameId: string;
  userId: string;
  tiers: Map<number, Tier>;
  pendingCount?: number;
  onShowOnBoard: (moveNumber: number) => void;
}

export function LiveTierDot({ gameId, userId, tiers, pendingCount = 0, onShowOnBoard }: Props) {
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [openNote, setOpenNote] = useState<number | null>(null);

  if (tiers.size === 0 && pendingCount === 0) return null;

  const green = [...tiers.values()].filter((t) => t === "green").length;
  const yellow = [...tiers.values()].filter((t) => t === "yellow").length;
  const red = [...tiers.values()].filter((t) => t === "red").length;

  // Latest non-green move for the dot
  const latestNonGreen = [...tiers.entries()]
    .filter(([, t]) => t !== "green")
    .sort(([a], [b]) => b - a)[0];

  const showDot =
    latestNonGreen != null && latestNonGreen[0] !== dismissed;

  const [latestMove, latestTier] = latestNonGreen ?? [null, null];

  return (
    <div className="live-tier-section">
      {/* Counter strip — always visible once any move analyzed */}
      <div className="live-tier-strip">
        <span className="live-tier-count live-tier-count--green">
          <span className="tier-dot tier-dot--green" />
          {green}
        </span>
        <span className="live-tier-count live-tier-count--yellow">
          <span className="tier-dot tier-dot--yellow" />
          {yellow}
        </span>
        <span className="live-tier-count live-tier-count--red">
          <span className="tier-dot tier-dot--red" />
          {red}
        </span>
        {pendingCount > 0 && (
          <span className="live-tier-count live-tier-count--pending" title="Analyzing…">
            <span className="tier-dot tier-dot--pending" />
            {pendingCount}
          </span>
        )}
      </div>

      {/* Latest non-green dot — dismissible */}
      {showDot && latestMove != null && latestTier != null && latestTier !== "green" && (
        <div className="live-tier-note">
          <button
            className={`live-tier-dot-btn tier-dot--clickable`}
            onClick={() => setOpenNote(openNote === latestMove ? null : latestMove)}
            aria-label={`Move ${latestMove} — ${latestTier}`}
          >
            <span className={`tier-dot tier-dot--${latestTier}`} />
            <span className="live-tier-label">
              Move {latestMove} — <span className={`tier-text--${latestTier}`}>{latestTier}</span>
            </span>
          </button>
          <button
            className="live-tier-dismiss"
            onClick={() => { setDismissed(latestMove); setOpenNote(null); }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {openNote != null && latestTier != null && latestTier !== "green" && (
        <MoveNotePopover
          gameId={gameId}
          moveNumber={openNote}
          forUserId={userId}
          tier={latestTier}
          onShowOnBoard={() => { onShowOnBoard(openNote); setOpenNote(null); }}
          onClose={() => setOpenNote(null)}
        />
      )}
    </div>
  );
}
