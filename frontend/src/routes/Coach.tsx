import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getNextAction,
  getActionHistory,
  type NextActionResponse,
  type ActionHistoryItem,
} from "../api";
import { useToast } from "../components/NotificationToast";
import { useIdentity } from "../lib/auth";

const KIND_LABEL: Record<string, string> = {
  review_game: "Review game",
  serve_drill: "Drill",
  teach_concept: "Learn concept",
  revisit_concept: "Revisit concept",
  idle: "Idle",
};

const KIND_COLOR: Record<string, string> = {
  review_game: "var(--pastel-pink)",
  serve_drill: "var(--pastel-cyan)",
  teach_concept: "var(--pastel-green)",
  revisit_concept: "var(--pastel-lavender)",
  idle: "var(--bg-2)",
};

const QUICK_CHIPS = [
  { label: "Why this action?", color: "gs-pill--pink" },
  { label: "What's my biggest weakness?", color: "gs-pill--yellow" },
  { label: "What should I focus on?", color: "gs-pill--mint" },
];

interface LocalMessage {
  id: number;
  role: "user" | "sensei";
  text: string;
}

export default function Coach() {
  const { userId } = useIdentity();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);

  const history = useQuery({
    queryKey: ["action-history", userId],
    queryFn: () => (userId ? getActionHistory(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const planner = useMutation({
    mutationFn: () => {
      if (!userId) throw new Error("Sign in first");
      return getNextAction(userId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["action-history", userId] });
      const label = KIND_LABEL[data.kind] ?? data.kind;
      const text = data.reason
        ? `I've picked a **${label}** for you. ${data.reason}`
        : `I've selected a **${label}** based on your recent activity and weakness profile.`;
      setLocalMessages((prev) => [
        ...prev,
        { id: Date.now(), role: "sensei", text },
      ]);
    },
    onError: (err) =>
      toast.push({ kind: "error", title: "Planner failed", body: String(err) }),
  });

  const action: NextActionResponse | null = planner.data ?? null;

  function handleSend() {
    const text = chatInput.trim();
    if (!text) return;
    setLocalMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", text },
      { id: Date.now() + 1, role: "sensei", text: "I'm still learning to answer free-form questions here. For now, press 'Ask Sensei' to get your next action recommendation." },
    ]);
    setChatInput("");
  }

  function handleChip(label: string) {
    setLocalMessages((prev) => [
      ...prev,
      { id: Date.now(), role: "user", text: label },
      {
        id: Date.now() + 1,
        role: "sensei",
        text: action?.reason
          ? action.reason
          : "Press 'Ask Sensei' first — I'll pick your next step and explain my reasoning.",
      },
    ]);
  }

  if (!userId) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", minHeight: "60vh", gap: 20, padding: 40, textAlign: "center",
      }}>
        <div className="gs-card" style={{ padding: "28px 36px", background: "var(--pastel-yellow)", boxShadow: "var(--shadow-block)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 64, fontWeight: 700, marginBottom: 12 }}>師</div>
          <h1 style={{ fontSize: 26, marginBottom: 10 }}>Sensei</h1>
          <p style={{ fontSize: 14, marginBottom: 18, color: "var(--ink-soft)" }}>
            Set a name in the Lobby first — Sensei plans against your weakness profile.
          </p>
          <Link to="/lobby" className="gs-btn gs-btn--primary" style={{ textDecoration: "none" }}>Go to Lobby →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="coach-page">
      {/* ── Left: action + history ────────────────────── */}
      <div className="coach-left">
        <NextActionPanel action={action} isPending={planner.isPending} onAsk={() => planner.mutate()} navigate={navigate} />
        <ActionHistoryPanel items={history.data ?? []} />
      </div>

      {/* ── Right: chat ───────────────────────────────── */}
      <div className="coach-right">
        <div className="coach-chat-header">
          <div className="coach-chat-avatar">先</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16 }}>Ask Sensei</div>
            <div style={{ fontSize: 12, color: "var(--ink-mute)" }}>Your AI coach</div>
          </div>
          <span className={`gs-pill ${planner.isPending ? "gs-pill--yellow" : "gs-pill--mint"}`} style={{ marginLeft: "auto" }}>
            {planner.isPending ? "thinking…" : "ready"}
          </span>
        </div>

        <div className="coach-chat-messages">
          {localMessages.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--ink-mute)", padding: "40px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>先</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>
                Press "Ask Sensei" to get started
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                I'll pick the most useful next step for your Go journey.
              </div>
            </div>
          )}
          {localMessages.map((msg) => (
            <div
              key={msg.id}
              className={`coach-chat-bubble ${msg.role === "sensei" ? "is-left" : "is-right"}`}
            >
              {msg.text}
            </div>
          ))}
          {planner.isPending && (
            <div className="coach-chat-bubble is-left is-typing">
              Thinking…
            </div>
          )}
        </div>

        <div className="coach-quick-chips">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.label}
              className={`gs-pill ${chip.color}`}
              style={{ cursor: "pointer", border: "2px solid var(--ink)" }}
              onClick={() => handleChip(chip.label)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="coach-chat-footer">
          <input
            className="coach-chat-input"
            placeholder="Ask Sensei anything…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button className="gs-btn gs-btn--primary" style={{ padding: "10px 16px", fontSize: 13, flexShrink: 0 }} onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Next action panel ─────────────────────────────────────────

function NextActionPanel({
  action,
  isPending,
  onAsk,
  navigate,
}: {
  action: NextActionResponse | null;
  isPending: boolean;
  onAsk: () => void;
  navigate: (to: string) => void;
}) {
  const kindLabel = action ? (KIND_LABEL[action.kind] ?? action.kind) : null;
  const bg = action ? (KIND_COLOR[action.kind] ?? "var(--pastel-yellow)") : "var(--pastel-yellow)";

  return (
    <div className="action-card" style={{ background: bg }}>
      <div className="action-card-mark">SENSEI</div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {kindLabel && <span className="gs-tag">{kindLabel.toUpperCase()}</span>}
        {action && (
          <span className={`gs-pill ${action.kind === "idle" ? "gs-pill--lav" : "gs-pill--ink"}`}>
            {action.kind === "idle" ? "no priority item" : "recommended"}
          </span>
        )}
      </div>

      {action ? (
        <>
          <div className="action-card-title">
            {action.kind === "review_game" && "Let's review your game."}
            {action.kind === "serve_drill" && (action.problem ? `Drill: ${action.problem.themes[0]?.replace(/_/g, " ") ?? "Tsumego"}` : "Time for a drill.")}
            {action.kind === "teach_concept" && (action.concept ? `Learn: ${action.concept.title}` : "New concept to study.")}
            {action.kind === "revisit_concept" && (action.concept ? `Revisit: ${action.concept.title}` : "Revisit a concept.")}
            {action.kind === "idle" && "You're all caught up!"}
          </div>
          {action.reason && (
            <div className="action-card-body">{action.reason}</div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {action.game_id && (
              <button className="gs-btn gs-btn--primary"
                onClick={() => navigate(`/games/${action.game_id}/review`)}>
                Open review →
              </button>
            )}
            {action.problem?.id && (
              <button className="gs-btn gs-btn--cyan"
                onClick={() => navigate(`/drill/${action.problem!.id}`)}>
                Start drill →
              </button>
            )}
            
            <button className="gs-btn" onClick={onAsk} disabled={isPending}>
              {isPending ? "Thinking…" : "Ask again"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="action-card-title">
            {isPending ? "Sensei is choosing…" : "Ready when you are."}
          </div>
          <div className="action-card-body">
            {isPending
              ? "The planner is checking your weaknesses, unreviewed games, and pending concepts."
              : "Tell Sensei you're here. I'll pick the one thing that'll improve your game most right now."}
          </div>
          <button className="gs-btn gs-btn--primary" onClick={onAsk} disabled={isPending}>
            {isPending ? "Thinking…" : "Ask Sensei"}
          </button>
        </>
      )}
    </div>
  );
}

// ─── Action history panel ──────────────────────────────────────

function ActionHistoryPanel({ items }: { items: ActionHistoryItem[] }) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="gs-section-h" style={{ marginBottom: 14 }}>PAST PICKS</div>
      <div className="action-history">
        {items.slice(0, 8).map((item) => (
          <div key={item.id} className="action-history-item">
            <div className="action-history-dot" style={{
              background: KIND_COLOR[item.kind] ?? "var(--bg-2)",
            }} />
            <div className="action-history-card">
              <div className="action-history-kind">
                {KIND_LABEL[item.kind] ?? item.kind}
              </div>
              {item.reason && (
                <div className="action-history-head">{item.reason}</div>
              )}
              <div className="action-history-ts">
                {new Date(item.picked_at).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
