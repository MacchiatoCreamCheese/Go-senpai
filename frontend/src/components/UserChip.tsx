import { Link } from "react-router-dom";

const AI_USER_ID = "00000000-0000-0000-0000-0000000000a1";

interface Props {
  userId: string | null | undefined;
  /** Override the displayed name (server may not return handles in lists). */
  handle?: string;
  /** Sensei's rank when this is the AI seat. */
  aiRank?: number | null;
  /** Show the colored stone dot beside the name. */
  color?: "B" | "W";
  /** Render as a link to that user's profile. */
  link?: boolean;
  /** Compact = single-line, no rank line. */
  compact?: boolean;
}

function rankLabel(r: number): string {
  return r > 0 ? `${r}k` : `${1 - r}d`;
}

export function UserChip({ userId, handle, aiRank, color, link = false, compact = false }: Props) {
  const isAi = userId === AI_USER_ID;
  const name = isAi ? "Sensei AI" : handle ?? (userId ? `${userId.slice(0, 8)}…` : "—");
  const rank = isAi && aiRank != null ? rankLabel(aiRank) : undefined;

  const inner = (
    <span className={"user-chip" + (compact ? " is-compact" : "") + (isAi ? " is-ai" : "")}>
      {color && <span className={`stone-dot ${color === "B" ? "black" : "white"}`} />}
      <span className="user-chip-body">
        <span className="user-chip-name">
          {name}
          {isAi && <span className="user-chip-ai-badge" aria-label="AI opponent">先</span>}
        </span>
        {!compact && rank && <span className="user-chip-rank">{rank}</span>}
      </span>
    </span>
  );

  if (link && userId && !isAi) {
    return <Link to={`/profile/${userId}`} className="user-chip-link">{inner}</Link>;
  }
  return inner;
}
