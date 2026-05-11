import { useEffect, useState } from "react";

import { updateMyHandle, updateHandleByUserId } from "../api";
import { HANDLE_KEY, useAuth, useIdentity } from "../lib/auth";
import { useToast } from "./NotificationToast";

interface Props {
  /** Compact: single-line, no explanatory subtitle. */
  compact?: boolean;
}

export function HandleEditor({ compact = false }: Props) {
  const { profile, legacy, refreshProfile } = useAuth();
  const { userId } = useIdentity();
  const toast = useToast();

  const currentHandle = legacy
    ? (localStorage.getItem(HANDLE_KEY) ?? "")
    : (profile?.handle ?? "");

  const [value, setValue] = useState(currentHandle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <form onSubmit={save} className={"handle-editor" + (compact ? " is-compact" : "")}>
      {!compact && (
        <label className="handle-editor-label" htmlFor="handle-input">
          Display name
        </label>
      )}
      <div className="handle-editor-row">
        <input
          id="handle-input"
          className="input"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          placeholder="your-handle"
        />
        <button
          type="submit"
          className="btn btn-ghost"
          disabled={pending || !value.trim() || value.trim() === currentHandle}
          style={{ padding: "8px 16px", fontSize: "0.9rem" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 6 }}>{error}</p>}
    </form>
  );
}
