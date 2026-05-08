import { useEffect, useState } from "react";

import { updateMyHandle } from "../api";
import { useAuth } from "../lib/auth";
import { useToast } from "./NotificationToast";

interface Props {
  /** Compact: single-line, no explanatory subtitle. */
  compact?: boolean;
}

export function HandleEditor({ compact = false }: Props) {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [value, setValue] = useState(profile?.handle ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resync the input when the user changes (e.g. after sign-in / sign-out).
  // Keyed on profile.id so editing the field doesn't clobber itself.
  useEffect(() => {
    setValue(profile?.handle ?? "");
  }, [profile?.id]);

  if (!profile) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === profile?.handle) return;
    setPending(true);
    setError(null);
    try {
      await updateMyHandle(trimmed);
      await refreshProfile();
      toast.push({ kind: "success", title: "Handle updated", body: `You're now ${trimmed}.` });
    } catch (err) {
      setError(String(err));
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
          onChange={(e) => setValue(e.target.value)}
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          placeholder="your-handle"
        />
        <button
          type="submit"
          className="btn btn-ghost"
          disabled={pending || !value.trim() || value.trim() === profile.handle}
          style={{ padding: "8px 16px", fontSize: "0.9rem" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p className="error-text" style={{ marginTop: 6 }}>{error}</p>}
    </form>
  );
}
