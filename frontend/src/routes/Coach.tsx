import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

import { getNextAction, type NextActionResponse } from "../api";
import { ActionCard } from "../components/ActionCard";
import { useToast } from "../components/NotificationToast";
import { useIdentity } from "../lib/auth";

export default function Coach() {
  const { userId } = useIdentity();
  const toast = useToast();

  const planner = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Sign in first");
      return getNextAction(userId);
    },
    onError: (err) =>
      toast.push({ kind: "error", title: "Planner failed", body: String(err) }),
  });

  if (!userId) {
    return (
      <div className="stub-page">
        <div className="stub-mark">師</div>
        <h1>Coach</h1>
        <p>Set a name in the Lobby first — Sensei plans against your weakness profile.</p>
        <Link to="/lobby" className="btn btn-primary">Go to Lobby</Link>
      </div>
    );
  }

  const action: NextActionResponse | null = planner.data ?? null;

  return (
    <div className="coach-page">
      <header className="coach-head">
        <div>
          <span className="home-eyebrow">Your coaching session</span>
          <h1 className="coach-title">先生 Sensei</h1>
          <p className="coach-tagline">
            Tell Sensei you're here. The planner picks one thing for you to do — review a
            game, drill a tsumego, or learn a concept — based on your weakness model.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => planner.mutate()}
          disabled={planner.isPending}
        >
          {planner.isPending ? "Thinking…" : action ? "Pick another" : "Start session"}
        </button>
      </header>

      <div className="coach-feed">
        {planner.isPending && (
          <div className="coach-thinking">
            <span className="ai-thinking-dots"><span /><span /><span /></span>
            <span>Sensei is choosing the most useful next step…</span>
          </div>
        )}

        {action && (
          <>
            <ActionCard action={action} eyebrow="Sensei suggests" />
            <details className="coach-why">
              <summary>Why this?</summary>
              <p className="coach-why-body">
                {action.reason ||
                  "The planner's reasoning trace isn't surfaced by the backend yet — once the action-history endpoint exists, this will show the severity and evidence that drove the choice."}
              </p>
            </details>
          </>
        )}

        {!action && !planner.isPending && (
          <div className="coach-empty">
            <div className="coach-empty-mark">師</div>
            <p>Press <strong>Start session</strong> above to ask Sensei what to do next.</p>
          </div>
        )}
      </div>

      <footer className="coach-foot">
        <span className="dim">
          Action history (a chronological feed of past picks) lands once the backend
          exposes <code>/users/:id/action-history</code>.
        </span>
      </footer>
    </div>
  );
}
