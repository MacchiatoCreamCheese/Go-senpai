import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIdentity } from "../lib/auth";
import { useDrillSessions } from "../hooks/useDrillData";
import type { DrillSession } from "../types/drill";

const PAGE = 12;

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
      className="drillhub-session-row"
      onClick={onRedo}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onRedo(); }}
    >
      <div className="drillhub-session-row-main">
        <div className="drillhub-session-row-title">
          <span className="drillhub-session-row-problems">
            {session.attemptCount} problem{session.attemptCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="drillhub-session-row-meta">
          <span className="drillhub-session-row-time">{formatRelative(session.startedAt)}</span>
          {session.finishedAt && (
            <span className="drillhub-session-row-time">
              {formatDuration(session.startedAt, session.finishedAt)}
            </span>
          )}
        </div>
      </div>
      <div className="drillhub-session-row-accuracy" style={{ color: accuracyColor }}>
        {pct(session.accuracy)}
      </div>
    </div>
  );
}

function RedoConfirmModal({
  session,
  onConfirm,
  onCancel,
}: {
  session: DrillSession;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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

export default function DrillHistory() {
  const navigate = useNavigate();
  const { userId } = useIdentity();
  const [page, setPage] = useState(0);
  const [redoSession, setRedoSession] = useState<DrillSession | null>(null);

  const { data: sessions, isLoading, error } = useDrillSessions(userId, 200);

  const finishedSessions = sessions?.filter(s => s.status === "finished") ?? [];
  const totalPages = Math.max(1, Math.ceil(finishedSessions.length / PAGE));
  const pageItems = finishedSessions.slice(page * PAGE, (page + 1) * PAGE);

  function handleRedoConfirm() {
    if (!redoSession) return;
    setRedoSession(null);
    navigate(`/drill/session/${redoSession.id}`, { state: { practiceMode: true } });
  }

  return (
    <div className="drill-history-page">
      <header className="drill-history-head">
        <div>
          <Link to="/drill" className="drill-history-back">← Back to Drills</Link>
          <h1 className="drill-history-title">
            {isLoading ? "Sessions" : `${finishedSessions.length} session${finishedSessions.length === 1 ? "" : "s"}`}
          </h1>
        </div>
      </header>

      {isLoading ? (
        <TabSkeleton />
      ) : error ? (
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
        <>
          <div className="drillhub-sessions-list">
            {pageItems.map(s => (
              <SessionRow
                key={s.id}
                session={s}
                onRedo={() => setRedoSession(s)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="games-pager">
              <button
                type="button"
                className="gs-btn"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Prev
              </button>
              <span className="games-pager-label">{page + 1} / {totalPages}</span>
              <button
                type="button"
                className="gs-btn"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {redoSession && (
        <RedoConfirmModal
          session={redoSession}
          onConfirm={handleRedoConfirm}
          onCancel={() => setRedoSession(null)}
        />
      )}
    </div>
  );
}
