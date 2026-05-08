import { Link } from "react-router-dom";

import type { NextActionResponse } from "../api";

interface Props {
  action: NextActionResponse;
  /** Header label above the card. */
  eyebrow?: string;
}

const KIND_MARK: Record<string, string> = {
  review_game: "評",
  serve_drill: "練",
  teach_concept: "智",
  revisit_concept: "復",
  idle: "閑",
};

const KIND_LABEL: Record<string, string> = {
  review_game: "Review your game",
  serve_drill: "Practise",
  teach_concept: "Learn",
  revisit_concept: "Refresh",
  idle: "All caught up",
};

export function ActionCard({ action, eyebrow = "Next action" }: Props) {
  const mark = KIND_MARK[action.kind] ?? "?";
  const label = KIND_LABEL[action.kind] ?? action.kind;

  return (
    <article className={`action-card kind-${action.kind}`}>
      <div className="action-card-mark" aria-hidden="true">{mark}</div>
      <div className="action-card-body">
        <div className="action-card-eyebrow">{eyebrow}</div>
        <h2 className="action-card-title">{label}</h2>
        <ActionBody action={action} />
      </div>
    </article>
  );
}

function ActionBody({ action }: { action: NextActionResponse }) {
  if (action.kind === "review_game" && action.game_id) {
    return (
      <>
        <p className="action-card-text">
          Your last game has lessons waiting. Open the review viewer when you're ready.
        </p>
        <div className="action-card-cta">
          <Link to={`/games/${action.game_id}`} className="btn btn-primary">Review now</Link>
          <Link to="/lobby" className="btn btn-ghost">Play another instead</Link>
        </div>
      </>
    );
  }

  if (action.kind === "serve_drill" && action.problem) {
    const themes = action.problem.themes.slice(0, 2).join(" · ");
    return (
      <>
        <p className="action-card-text">
          Practise: <strong>{themes || `Problem ${action.problem.id.slice(0, 8)}`}</strong>{" "}
          <span className="dim">· difficulty {action.problem.difficulty}</span>
        </p>
        <div className="action-card-cta">
          <Link to={`/drill/${action.problem.id}`} className="btn btn-primary">Start drill</Link>
          <Link to="/drill" className="btn btn-ghost">Pick another</Link>
        </div>
      </>
    );
  }

  if ((action.kind === "teach_concept" || action.kind === "revisit_concept") && action.concept) {
    const verb = action.kind === "teach_concept" ? "Learn" : "Refresh";
    return (
      <>
        <p className="action-card-text">
          {verb}: <strong>{action.concept.title}</strong>
        </p>
        <div className="action-card-cta">
          <Link to={`/concepts/${action.concept.id}`} className="btn btn-primary">Open lesson</Link>
        </div>
      </>
    );
  }

  // Idle
  return (
    <>
      <p className="action-card-text">
        {action.reason || "You're up to date — play a game when you're ready."}
      </p>
      <div className="action-card-cta">
        <Link to="/lobby" className="btn btn-primary">Find a game</Link>
        <Link to="/coach" className="btn btn-ghost">Open Coach</Link>
      </div>
    </>
  );
}
