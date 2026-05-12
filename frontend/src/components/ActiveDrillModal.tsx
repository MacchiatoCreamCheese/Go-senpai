import type { DrillSession } from "../types/drill";

export interface ActiveDrillModalProps {
  session: DrillSession;
  isDeleting: boolean;
  isCreating: boolean;
  onDeleteAndNew: () => void;
  onResume: () => void;
  onClose: () => void;
}

export function ActiveDrillModal({
  session,
  isDeleting,
  isCreating,
  onDeleteAndNew,
  onResume,
  onClose,
}: ActiveDrillModalProps) {
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
