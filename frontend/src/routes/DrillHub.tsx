import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIdentity } from "../lib/auth";
import { useToast } from "../components/NotificationToast";
import {
  useDrillSessions,
  useDrillAnalytics,
  useCreateDrillSession,
  useDeleteDrillSession,
} from "../hooks/useDrillData";
import type { DrillSession, DrillAnalytics } from "../types/drill";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function formatDuration(started: string, finished: string | null): string {
  if (!finished) return "in progress";
  const secs = Math.round(
    (new Date(finished).getTime() - new Date(started).getTime()) / 1000,
  );
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Shared micro-components (reuse profile patterns) ──────────────────────────

function TabSkeleton() {
  return (
    <div className="prf-skeleton-wrap" aria-busy="true" aria-label="Loading…">
      {[80, 60, 90, 50, 75].map((w, i) => (
        <div key={i} className="prf-skeleton-line" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="prf-error">
      <div className="prf-error-glyph">⚠</div>
      <div className="prf-error-msg">{message}</div>
      <p className="prf-error-hint">Try refreshing the page.</p>
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="gs-card" style={{
      padding: "14px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      minWidth: 100,
    }}>
      <span style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 26,
        lineHeight: 1,
        color: "var(--ink)",
        letterSpacing: "-0.02em",
      }}>
        {value}
      </span>
      <span style={{ fontSize: 12, color: "var(--ink-mute)", fontWeight: 500 }}>
        {label}
      </span>
    </div>
  );
}

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({ session, onRedo }: { session: DrillSession; onRedo: () => void }) {
  const accuracyColor = session.accuracy == null
    ? "var(--ink-mute)"
    : session.accuracy >= 0.7 ? "var(--tier-good)"
    : session.accuracy >= 0.4 ? "var(--tier-ok)"
    : "var(--tier-bad)";

  return (
    <div
      role="button"
      tabIndex={0}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderRadius: 12,
        border: "2px solid var(--border)",
        background: "var(--bg-2)",
        cursor: "pointer",
        transition: "transform 80ms, box-shadow 80ms",
      }}
      onClick={onRedo}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onRedo(); }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = "translate(-1px,-1px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-block-sm)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
            {session.attemptCount} problem{session.attemptCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
            {formatRelative(session.startedAt)}
          </span>
          {session.finishedAt && (
            <span style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
              {formatDuration(session.startedAt, session.finishedAt)}
            </span>
          )}
        </div>
      </div>
      <div style={{
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: 20,
        color: accuracyColor,
        minWidth: 52,
        textAlign: "right",
      }}>
        {pct(session.accuracy)}
      </div>
    </div>
  );
}

// ── Redo confirm modal ────────────────────────────────────────────────────────

interface RedoConfirmModalProps {
  session: DrillSession;
  onConfirm: () => void;
  onCancel: () => void;
}

function RedoConfirmModal({ session, onConfirm, onCancel }: RedoConfirmModalProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(26,23,20,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="gs-card"
        style={{
          padding: "36px 40px",
          background: "#F5F2ED",
          boxShadow: "var(--shadow-block)",
          maxWidth: 400, width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 44, lineHeight: 1, marginBottom: 14 }}>
          練
        </div>
        <h2 style={{ fontSize: 22, marginBottom: 10, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
          Redo this session?
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 8 }}>
          {session.attemptCount} problem{session.attemptCount !== 1 ? "s" : ""}
          {session.finishedAt ? ` · ${formatDuration(session.startedAt, session.finishedAt)}` : ""}
          {session.accuracy != null ? ` · ${pct(session.accuracy)} accuracy` : ""}
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 28, fontStyle: "italic" }}>
          Practice only — your stats won't be updated.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            className="gs-btn gs-btn--primary"
            onClick={onConfirm}
            style={{ flex: 1 }}
          >
            Yes, redo
          </button>
          <button type="button" className="gs-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteSessionModalProps {
  session: DrillSession;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function DeleteSessionModal({ session, onConfirm, onCancel, isDeleting }: DeleteSessionModalProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(26,23,20,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="gs-card"
        style={{
          padding: "36px 40px",
          background: "var(--pastel-pink)",
          boxShadow: "var(--shadow-block)",
          maxWidth: 420, width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 44, lineHeight: 1, marginBottom: 14 }}>
          削
        </div>
        <h2 style={{ fontSize: 22, marginBottom: 10, fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
          Delete this active session?
        </h2>
        <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 8 }}>
          {session.attemptCount} problem{session.attemptCount !== 1 ? "s" : ""} will be cleared from the active session view.
        </p>
        <p style={{ fontSize: 13, color: "var(--ink-mute)", marginBottom: 28, fontStyle: "italic" }}>
          This removes the session from your drill hub so you can start fresh.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            type="button"
            className="gs-btn gs-btn--primary"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{ flex: 1 }}
          >
            {isDeleting ? "Deleting…" : "Delete session"}
          </button>
          <button type="button" className="gs-btn" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Analytics section ─────────────────────────────────────────────────────────

function AnalyticsSection({ analytics }: { analytics: DrillAnalytics }) {
  const hasThemes = analytics.themeBreakdown.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="gs-card" style={{ padding: "12px 18px", flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 12, color: "var(--ink-mute)", marginBottom: 4 }}>This week</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>
            {pct(analytics.accuracyThisWeek)}
          </div>
        </div>
        <div className="gs-card" style={{ padding: "12px 18px", flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 12, color: "var(--ink-mute)", marginBottom: 4 }}>Last week</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22 }}>
            {pct(analytics.accuracyLastWeek)}
          </div>
        </div>
      </div>

      {hasThemes && (
        <div>
          <div className="gs-section-h" style={{ fontSize: 12, marginBottom: 10 }}>
            by theme
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {analytics.themeBreakdown.slice(0, 6).map(t => (
              <div key={t.theme} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ink-soft)",
                  minWidth: 120,
                  textTransform: "lowercase",
                }}>
                  {t.theme.replace(/_/g, " ")}
                </span>
                <div style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 999,
                  background: "var(--border)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: t.accuracy != null ? `${Math.round(t.accuracy * 100)}%` : "0%",
                    background: t.accuracy == null ? "var(--ink-mute)"
                      : t.accuracy >= 0.7 ? "var(--tier-good)"
                      : t.accuracy >= 0.4 ? "var(--tier-ok)"
                      : "var(--tier-bad)",
                    borderRadius: 999,
                    transition: "width 400ms ease",
                  }} />
                </div>
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ink-soft)",
                  minWidth: 36,
                  textAlign: "right",
                }}>
                  {pct(t.accuracy)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Start session modal ───────────────────────────────────────────────────────

const PRESETS = [3, 5, 10] as const;

interface StartSessionModalProps {
  onClose: () => void;
  onStart: (count: number) => void;
  isPending: boolean;
}

function StartSessionModal({ onClose, onStart, isPending }: StartSessionModalProps) {
  const [selected, setSelected] = useState<number>(5);
  const [isCustom, setIsCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const customVal = parseInt(customInput, 10);
  const customValid = !isCustom || (Number.isInteger(customVal) && customVal >= 1 && customVal <= 50);
  const finalCount = isCustom ? customVal : selected;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(26,23,20,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="gs-card"
        style={{
          padding: "32px 36px",
          background: "#F5F2ED",
          boxShadow: "var(--shadow-block)",
          border: "3px solid var(--border)",
          maxWidth: 380, width: "100%",
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>
          How many problems?
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {PRESETS.map(n => (
            <button
              key={n}
              type="button"
              className={`gs-btn${!isCustom && selected === n ? " gs-btn--primary" : ""}`}
              style={{ flex: 1, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}
              onClick={() => { setSelected(n); setIsCustom(false); }}
            >
              {n}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <button
            type="button"
            className={`gs-btn${isCustom ? " gs-btn--primary" : ""}`}
            style={{ whiteSpace: "nowrap" }}
            onClick={() => { setIsCustom(true); }}
          >
            Custom
          </button>
          <input
            type="number"
            min={1}
            max={50}
            placeholder="1–50"
            value={customInput}
            disabled={!isCustom}
            onChange={e => setCustomInput(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: 8,
              border: `2px solid ${isCustom && !customValid ? "var(--tier-bad)" : "var(--border)"}`,
              background: "var(--bg-2)",
              color: "var(--ink)",
              fontFamily: "var(--font-mono)",
              fontSize: 15,
              outline: "none",
            }}
          />
        </div>

        {isCustom && !customValid && customInput !== "" && (
          <p style={{ fontSize: 12, color: "var(--tier-bad)", marginBottom: 12, marginTop: -16 }}>
            Enter a number between 1 and 50.
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="gs-btn gs-btn--primary"
            disabled={isPending || !customValid || (isCustom && customInput === "")}
            onClick={() => onStart(finalCount)}
            style={{ flex: 1 }}
          >
            {isPending ? "Starting…" : "Start Session"}
          </button>
          <button type="button" className="gs-btn" onClick={onClose} disabled={isPending}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DrillHub() {
  const navigate = useNavigate();
  const { userId } = useIdentity();
  const toast = useToast();

  const [showModal, setShowModal] = useState(false);
  const [redoSession, setRedoSession] = useState<DrillSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<DrillSession | null>(null);

  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useDrillSessions(userId);
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useDrillAnalytics(userId);
  const createSession = useCreateDrillSession();
  const removeSession = useDeleteDrillSession();

  if (!userId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 40 }}>
        <div className="gs-card" style={{ padding: "32px 36px", background: "var(--pastel-yellow)", boxShadow: "var(--shadow-block)", textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 60, marginBottom: 12 }}>練</div>
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>Drill</h1>
          <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 20 }}>Set a name in the Lobby first — drills are personalised to you.</p>
          <Link to="/lobby" className="gs-btn gs-btn--primary" style={{ textDecoration: "none" }}>Go to Lobby →</Link>
        </div>
      </div>
    );
  }

  const activeSession = sessions?.find(s => s.status === "active");
  const finishedSessions = sessions?.filter(s => s.status === "finished") ?? [];

  function handleRedoConfirm() {
    if (!redoSession) return;
    setRedoSession(null);
    navigate(`/drill/session/${redoSession.id}`, { state: { practiceMode: true } });
  }

  async function handleDeleteSessionConfirm() {
    if (!deleteSession || !userId) return;
    try {
      await removeSession.mutateAsync({ sessionId: deleteSession.id, userId });
      setDeleteSession(null);
      toast.push({ kind: "success", title: "Session deleted", body: "You can start a new session now." });
    } catch (err) {
      toast.push({ kind: "error", title: "Could not delete session", body: String(err) });
    }
  }

  async function handleStartSession(targetProblemCount: number) {
    if (!userId) return;
    try {
      const session = await createSession.mutateAsync({ userId, targetProblemCount });
      setShowModal(false);
      navigate(`/drill/session/${session.id}`);
    } catch (err) {
      toast.push({ kind: "error", title: "Could not start session", body: String(err) });
    }
  }

  const totalAttempts = analytics?.totalAttempts ?? 0;
  const overallAccuracy = analytics?.accuracy ?? null;
  const sessionsCount = analytics?.sessionsCount ?? 0;

  return (
    <div style={{
      maxWidth: 1100,
      margin: "0 auto",
      padding: "32px 40px 60px",
      display: "flex",
      flexDirection: "column",
      gap: 32,
    }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 32, margin: 0, letterSpacing: "-0.02em" }}>
            練 Drill
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink-mute)", margin: "6px 0 0" }}>
            Build pattern recognition through focused problem-solving.
          </p>
        </div>
        <button
          className="gs-btn gs-btn--primary"
          onClick={() => setShowModal(true)}
          disabled={sessionsLoading || !!activeSession}
          style={{ whiteSpace: "nowrap", flexShrink: 0 }}
        >
          Start Session
        </button>
      </div>

      {activeSession && (
        <div className="gs-card" style={{ padding: "12px 16px", background: "var(--bg-2)", border: "2px solid var(--border)" }}>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>
            You already have an active session. Finish it or delete it before starting a new one.
          </div>
          <button
            type="button"
            className="gs-btn"
            onClick={() => setDeleteSession(activeSession)}
            style={{ background: "var(--pastel-pink)" }}
          >
            Delete active session
          </button>
        </div>
      )}

      {showModal && (
        <StartSessionModal
          onClose={() => setShowModal(false)}
          onStart={handleStartSession}
          isPending={createSession.isPending}
        />
      )}

      {/* ── Stats row ────────────────────────────────────────────── */}
      {analyticsLoading ? (
        <div style={{ display: "flex", gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="gs-card prf-skeleton-wrap" style={{ flex: 1, padding: 16, minHeight: 72 }} aria-hidden />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatChip label="total problems" value={totalAttempts > 0 ? totalAttempts : "—"} />
          <StatChip label="accuracy" value={pct(overallAccuracy)} />
          <StatChip label="sessions" value={sessionsCount > 0 ? sessionsCount : "—"} />
        </div>
      )}

      {/* ── Active session resume banner ─────────────────────────── */}
      {activeSession && (
        <div className="gs-card" style={{
          padding: "14px 20px",
          background: "var(--pastel-cyan)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>
              Session in progress
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 2 }}>
              {activeSession.attemptCount} problem{activeSession.attemptCount !== 1 ? "s" : ""} so far
              · started {formatRelative(activeSession.startedAt)}
            </div>
          </div>
          <Link
            to={`/drill/session/${activeSession.id}`}
            className="gs-btn gs-btn--primary"
            style={{ textDecoration: "none", whiteSpace: "nowrap" }}
          >
            Resume →
          </Link>
        </div>
      )}

      {/* ── Recent sessions ──────────────────────────────────────── */}
      <div>
        <div className="gs-section-h" style={{ marginBottom: 14 }}>Recent Sessions</div>
        {sessionsLoading ? (
          <TabSkeleton />
        ) : sessionsError ? (
          <SectionError message="Could not load session history." />
        ) : finishedSessions.length === 0 ? (
          <div className="prf-empty">
            <div className="prf-empty-glyph">練</div>
            <div className="prf-empty-title">No completed sessions yet</div>
            <p className="prf-empty-sub">
              Finish a session to see your history and accuracy stats here.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {finishedSessions.map(s => (
              <SessionRow
                key={s.id}
                session={s}
                onRedo={() => setRedoSession(s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Analytics ────────────────────────────────────────────── */}
      {!analyticsLoading && !analyticsError && analytics && analytics.totalAttempts >= 3 && (
        <div>
          <div className="gs-section-h" style={{ marginBottom: 14 }}>Analytics</div>
          <AnalyticsSection analytics={analytics} />
        </div>
      )}

      {/* ── Redo confirm modal ───────────────────────────────────── */}
      {redoSession && (
        <RedoConfirmModal
          session={redoSession}
          onConfirm={handleRedoConfirm}
          onCancel={() => setRedoSession(null)}
        />
      )}

      {deleteSession && (
        <DeleteSessionModal
          session={deleteSession}
          onConfirm={handleDeleteSessionConfirm}
          onCancel={() => setDeleteSession(null)}
          isDeleting={removeSession.isPending}
        />
      )}

    </div>
  );
}
