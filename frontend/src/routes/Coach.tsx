import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  appendCoachTurn,
  createCoachSession,
  getActionHistory,
  getMyGames,
  getNextAction,
  sendCoachMessage,
  type ActionHistoryItem,
  type NextActionResponse,
} from "../api";
import { useToast } from "../components/NotificationToast";
import { useIdentity } from "../lib/auth";
import {
  useDrillSessions,
  useCreateDrillSession,
  useDeleteDrillSession,
} from "../hooks/useDrillData";
import type { DrillSession } from "../types/drill";

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
  ts?: number;
}

// Guard against old messages stored as JSON (e.g. { "assistant_output_md": "..." })
function extractText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return raw;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const text = parsed.assistant_output_md ?? parsed.reply ?? parsed.content ?? parsed.text;
    if (typeof text === "string") return text;
  } catch { /* not JSON */ }
  return raw;
}

// ─── Active session conflict modal ────────────────────────────────────────────

function ActiveDrillSessionModal({
  session,
  isDeleting,
  isCreating,
  onDeleteAndNew,
  onResume,
  onClose,
}: {
  session: DrillSession;
  isDeleting: boolean;
  isCreating: boolean;
  onDeleteAndNew: () => void;
  onResume: () => void;
  onClose: () => void;
}) {
  const busy = isDeleting || isCreating;
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(26,23,20,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="gs-card"
        style={{
          padding: "32px 36px",
          background: "var(--bg)",
          boxShadow: "var(--shadow-block)",
          maxWidth: 400, width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 44, lineHeight: 1, marginBottom: 14 }}>
          練
        </div>
        <h2 style={{ fontSize: 20, marginBottom: 8, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
          Active session in progress
        </h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>
          {session.attemptCount} problem{session.attemptCount !== 1 ? "s" : ""} attempted so far.
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 28 }}>
          What would you like to do?
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            className="gs-btn gs-btn--primary"
            disabled={busy}
            onClick={onDeleteAndNew}
            style={{ width: "100%" }}
          >
            {isDeleting ? "Deleting…" : isCreating ? "Starting…" : "Delete & start new drill"}
          </button>
          <button
            type="button"
            className="gs-btn"
            disabled={busy}
            onClick={onResume}
            style={{ width: "100%", background: "var(--pastel-cyan)" }}
          >
            Resume existing session →
          </button>
          <button
            type="button"
            className="gs-btn"
            disabled={busy}
            onClick={onClose}
            style={{ width: "100%" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Coach() {
  const { userId } = useIdentity();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [chatInput, setChatInput] = useState("");
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const pendingChipRef = useRef<string | null>(null);
  const persistenceReady = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const storageKey = `coach_chat_${userId ?? "anon"}`;
  const sessionKey = `coach_session_${userId ?? "anon"}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as LocalMessage[];
        setLocalMessages(parsed);
      } else if (userId) {
        const anonData = localStorage.getItem("coach_chat_anon");
        if (anonData) {
          try {
            const parsed = JSON.parse(anonData) as LocalMessage[];
            setLocalMessages(parsed);
          } catch {
            // ignore malformed storage
          }
        }
      }
    } catch {
      // ignore malformed storage
    }
    try {
      const storedSession = localStorage.getItem(sessionKey);
      if (storedSession) setSessionId(storedSession);
    } catch {
      // ignore storage errors
    }
  }, [storageKey, sessionKey, userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, isSending]);

  useEffect(() => {
    // Skip the first write while messages are still empty — prevents clearing
    // localStorage before the load effect has restored the stored history.
    if (!persistenceReady.current && localMessages.length === 0) return;
    persistenceReady.current = true;
    try {
      localStorage.setItem(storageKey, JSON.stringify(localMessages));
    } catch {
      // ignore storage errors
    }
  }, [localMessages, storageKey]);

  useEffect(() => {
    if (!userId) return;
    const resolvedUserId = userId;
    if (sessionId) return;
    let alive = true;
    async function ensureSession() {
      try {
        const games = await getMyGames(resolvedUserId);
        if (!alive) return;
        const latestGame = games[0];
        if (!latestGame) return;
        const created = await createCoachSession(latestGame.id, resolvedUserId);
        if (!alive) return;
        setSessionId(created.session_id);
        localStorage.setItem(sessionKey, created.session_id);
      } catch (err) {
        // fall back to localStorage-only
      }
    }
    ensureSession();
    return () => {
      alive = false;
    };
  }, [sessionId, sessionKey, userId]);


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
        { id: Date.now(), role: "sensei", text, ts: Date.now() },
      ]);
      if (sessionId) {
        appendCoachTurn(sessionId, {
          role: "assistant",
          mode: "planner",
          assistant_output_md: text,
        }).catch(() => undefined);
      }

      // flush a chip that was clicked before the planner had run
      // (the user bubble was already added in handleChip — only add the sensei reply)
      if (pendingChipRef.current) {
        pendingChipRef.current = null;
        const chipReply = data.reason
          ? `${data.reason} — see the recommendation card above.`
          : "Check the action card at the top for your recommendation.";
        setLocalMessages((prev) => [
          ...prev,
          { id: Date.now() + 2, role: "sensei", text: chipReply, ts: Date.now() + 2 },
        ]);
      }
    },
    onError: (err) =>
      toast.push({ kind: "error", title: "Planner failed", body: String(err) }),
  });

  const action: NextActionResponse | null = planner.data ?? null;

  // ── Quick drill ────────────────────────────────────────────────────────────
  const [showDrillModal, setShowDrillModal] = useState(false);
  const { data: sessions } = useDrillSessions(userId);
  const activeSession = sessions?.find(s => s.status === "active") ?? null;
  const createSession = useCreateDrillSession();
  const removeSession = useDeleteDrillSession();

  async function handleQuickDrill() {
    if (activeSession) {
      setShowDrillModal(true);
      return;
    }
    await startNewDrill();
  }

  async function startNewDrill() {
    if (!userId) return;
    try {
      const session = await createSession.mutateAsync({ userId, targetProblemCount: 1 });
      setShowDrillModal(false);
      navigate(`/drill/session/${session.id}`);
    } catch (err) {
      toast.push({ kind: "error", title: "Could not start drill", body: String(err) });
    }
  }

  async function handleDeleteAndNew() {
    if (!activeSession || !userId) return;
    try {
      await removeSession.mutateAsync({ sessionId: activeSession.id, userId });
      await startNewDrill();
    } catch (err) {
      toast.push({ kind: "error", title: "Could not start drill", body: String(err) });
    }
  }

  function handleResumeSession() {
    if (!activeSession) return;
    setShowDrillModal(false);
    navigate(`/drill/session/${activeSession.id}`);
  }

  async function handleSend() {
    const text = chatInput.trim();
    if (!text || isSending) return;
    setChatInput("");
    const now = Date.now();
    setLocalMessages((prev) => [...prev, { id: now, role: "user", text, ts: now }]);

    if (!sessionId) {
      setLocalMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "sensei", text: "Starting a session — please try again in a moment.", ts: Date.now() + 1 },
      ]);
      return;
    }

    setIsSending(true);
    try {
      const reply = await sendCoachMessage(sessionId, userId!, text);
      setLocalMessages((prev) => [...prev, { id: Date.now(), role: "sensei", text: reply, ts: Date.now() }]);
    } catch {
      setLocalMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: "sensei", text: "Sorry, I couldn't respond right now. Please try again.", ts: Date.now() + 1 },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleChip(label: string) {
    // Always show the user bubble immediately
    const now = Date.now();
    setLocalMessages((prev) => [...prev, { id: now, role: "user", text: label, ts: now }]);

    if (!action) {
      // Planner hasn't run yet — trigger it; onSuccess will add the sensei reply
      pendingChipRef.current = label;
      planner.mutate();
      return;
    }

    // Planner already ran — reply now
    const chipReply = action.reason
      ? `${action.reason} — see the recommendation card above.`
      : "Check the action card at the top for your recommendation.";
    setLocalMessages((prev) => [...prev, { id: Date.now() + 1, role: "sensei", text: chipReply, ts: Date.now() + 1 }]);
    if (sessionId) {
      appendCoachTurn(sessionId, { role: "user", mode: "chip", user_input: label }).catch(() => undefined);
      appendCoachTurn(sessionId, { role: "assistant", mode: "chip", assistant_output_md: chipReply }).catch(() => undefined);
    }
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
      {showDrillModal && activeSession && (
        <ActiveDrillSessionModal
          session={activeSession}
          isDeleting={removeSession.isPending}
          isCreating={createSession.isPending}
          onDeleteAndNew={handleDeleteAndNew}
          onResume={handleResumeSession}
          onClose={() => setShowDrillModal(false)}
        />
      )}

      {/* ── Left: action + history ────────────────────── */}
      <div className="coach-left">
        <NextActionPanel action={action} isPending={planner.isPending} onAsk={() => planner.mutate()} navigate={navigate} />

        {/* Quick drill shortcut */}
        <div className="action-card" style={{ background: "var(--pastel-cyan)", marginTop: 0 }}>
          <div className="action-card-mark">DRILL</div>
          <div className="action-card-title" style={{ marginBottom: 6 }}>
            {activeSession ? "Session in progress" : "Quick drill"}
          </div>
          <div className="action-card-body" style={{ marginBottom: 14 }}>
            {activeSession
              ? `${activeSession.attemptCount} problem${activeSession.attemptCount !== 1 ? "s" : ""} attempted — resume or start fresh.`
              : "Jump straight into one focused problem targeted to your weaknesses."}
          </div>
          <button
            type="button"
            className="gs-btn gs-btn--primary"
            onClick={handleQuickDrill}
            disabled={createSession.isPending || removeSession.isPending}
          >
            {createSession.isPending ? "Starting…" : activeSession ? "Manage session →" : "Start 1-problem drill →"}
          </button>
        </div>

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
          <button
            className="gs-btn"
            style={{ marginLeft: "auto", padding: "5px 10px", fontSize: 12 }}
            onClick={() => {
              setLocalMessages([]);
              try { localStorage.removeItem(storageKey); } catch {}
            }}
          >
            Clear
          </button>
        </div>

        <div className="coach-chat-messages">
          {localMessages.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--ink-mute)", padding: "40px 20px" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>先</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>
                Sensei is ready
              </div>
              <div style={{ fontSize: 13, marginTop: 6 }}>
                Ask anything, or tap a quick question below.
              </div>
            </div>
          )}
          {localMessages.map((msg) => (
            <div
              key={msg.id}
              className={`coach-chat-bubble ${msg.role === "sensei" ? "is-left" : "is-right"}`}
            >
              {msg.role === "sensei" && <span className="coach-bubble-avatar">先</span>}
              <div className="coach-bubble-body">
                <span className="coach-bubble-text">{extractText(msg.text)}</span>
                {msg.ts && (
                  <span className="coach-bubble-ts">
                    {new Date(msg.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          ))}
          {(planner.isPending || isSending) && (
            <div className="coach-chat-bubble is-left">
              <span className="coach-bubble-avatar">先</span>
              <div className="coach-typing-dots">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
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
          <textarea
            className="coach-chat-input"
            placeholder="Ask Sensei anything…"
            value={chatInput}
            rows={1}
            onChange={(e) => {
              setChatInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button className="gs-btn gs-btn--primary" style={{ padding: "10px 16px", fontSize: 13, flexShrink: 0 }} onClick={handleSend} disabled={isSending}>
            {isSending ? "…" : "Send"}
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
