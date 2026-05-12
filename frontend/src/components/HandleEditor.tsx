import { useEffect, useState } from "react";

import { updateMyHandle, updateHandleByUserId } from "../api";
import { HANDLE_KEY, useAuth, useIdentity } from "../lib/auth";
import { useToast } from "./NotificationToast";

interface Props {
  /** If true, only show an edit icon that opens a modal. */
  modal?: boolean;
}

export function HandleEditor({ modal = false }: Props) {
  const { profile, legacy, refreshProfile } = useAuth();
  const { userId } = useIdentity();
  const toast = useToast();

  const currentHandle = legacy
    ? (localStorage.getItem(HANDLE_KEY) ?? "")
    : (profile?.handle ?? "");

  const [value, setValue] = useState(currentHandle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Resync when the user or auth state changes.
  useEffect(() => {
    setValue(
      legacy
        ? (localStorage.getItem(HANDLE_KEY) ?? "")
        : (profile?.handle ?? ""),
    );
  }, [profile?.id, legacy]);

  // Nothing to edit if there's no identity at all.
  if (!legacy && !profile) return null;
  if (legacy && !userId) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === currentHandle) return;
    if (trimmed.length < 2) { setError("At least 2 characters required."); return; }
    if (trimmed.length > 32) { setError("Maximum 32 characters."); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setError("Only letters, numbers, hyphens and underscores allowed.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      if (!legacy) {
        await updateMyHandle(trimmed);
        await refreshProfile();
      } else {
        if (!userId) return;
        const u = await updateHandleByUserId(userId, trimmed);
        localStorage.setItem(HANDLE_KEY, u.handle);
      }
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        if (modal) setShowModal(false);
      }, 2000);
      toast.push({ kind: "success", title: "Handle updated", body: `You're now ${trimmed}.` });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("already")) {
        setError("That handle is already taken.");
      } else {
        setError(msg);
      }
    } finally {
      setPending(false);
    }
  }

  const isChanged = value.trim() !== currentHandle && value.trim().length > 0;

  // Modal mode: show just an edit icon
  if (modal) {
    return (
      <>
        <button
          type="button"
          className="handle-editor-icon"
          onClick={() => { setShowModal(true); setValue(currentHandle); setError(null); setShowSuccess(false); }}
          title="Edit display name"
          aria-label="Edit display name"
        >
          ✎
        </button>

        {showModal && (
          <div className="handle-editor-modal-overlay" onClick={() => { if (!pending) setShowModal(false); }}>
            <div className="handle-editor-modal" onClick={e => e.stopPropagation()}>
              <div className="handle-editor-modal-header">
                <h2 className="handle-editor-modal-title">Edit display name</h2>
                <button
                  type="button"
                  className="handle-editor-modal-close"
                  onClick={() => { if (!pending) setShowModal(false); }}
                  aria-label="Close"
                  disabled={pending}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={save} className="handle-editor-modal-body">
                <p className="handle-editor-modal-hint">
                  Your handle is how other players will know you. Keep it friendly!
                </p>

                <div className="handle-editor-row">
                  <input
                    id="handle-input-modal"
                    className="handle-editor-input"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setError(null); }}
                    maxLength={32}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="your-handle"
                    disabled={pending}
                    autoFocus
                  />
                </div>

                {error && <p className="handle-editor-error">{error}</p>}

                <div className="handle-editor-modal-footer">
                  <button
                    type="button"
                    className="handle-editor-modal-btn handle-editor-modal-btn-cancel"
                    onClick={() => setShowModal(false)}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`handle-editor-modal-btn handle-editor-modal-btn-save ${showSuccess ? "is-success" : ""}`}
                    disabled={pending || !isChanged}
                  >
                    {pending ? "Saving…" : showSuccess ? "✓ Saved" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  // Inline mode (kept for backward compatibility if needed)
  return (
    <form onSubmit={save} className="handle-editor">
      <label className="handle-editor-label" htmlFor="handle-input">
        Display name
      </label>
      <div className="handle-editor-row">
        <input
          id="handle-input"
          className="handle-editor-input"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          placeholder="your-handle"
          disabled={pending}
        />
        <button
          type="submit"
          className={`handle-editor-btn ${showSuccess ? "is-success" : ""}`}
          disabled={pending || !isChanged}
          aria-label="Save new display name"
        >
          {pending ? "Saving…" : showSuccess ? "✓ Saved" : "Save"}
        </button>
      </div>
      {error && <p className="handle-editor-error">{error}</p>}
    </form>
  );
}
