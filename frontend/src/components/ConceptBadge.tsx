import { Link } from "react-router-dom";

interface Props {
  conceptId: string;
  /** Human-readable label, falls back to the ID if not known yet. */
  label?: string;
}

export function ConceptBadge({ conceptId, label }: Props) {
  return (
    <Link to={`/concepts/${conceptId}`} className="concept-badge">
      <span className="concept-badge-mark" aria-hidden="true">智</span>
      {label ?? conceptId}
    </Link>
  );
}
