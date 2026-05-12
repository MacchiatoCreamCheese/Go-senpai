import { useState } from "react";
import type { ReactNode } from "react";

import { HANDLE_KEY, useAuth, useIdentity } from "../lib/auth";
import { updateMyHandle, updateHandleByUserId } from "../api";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the handle looks like the auto-generated default produced
 * by the backend (_default_auth_handle / ensure_legacy_user).
 *
 * Pattern: "{email_slug}-{uidShort12}"  or  "user-{uidShort16}"
 * We detect it by checking whether the handle ends with the user's UUID prefix.
 */
function isAutoHandle(handle: string | null | undefined, userId: string | null | undefined): boolean {
  if (!handle) return true;
  if (!userId) return false;
  const uid12 = userId.replace(/-/g, "").slice(0, 12);
  const uid16 = userId.replace(/-/g, "").slice(0, 16);
  return handle.endsWith(`-${uid12}`) || handle === `user-${uid16}`;
}

function validateHandle(v: string): string | null {
  const t = v.trim();
  if (t.length < 2) return "At least 2 characters required.";
  if (t.length > 32) return "Maximum 32 characters.";
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return "Only letters, numbers, hyphens and underscores allowed.";
  return null;
}

// ── Set-handle screen ─────────────────────────────────────────────────────────

function SetHandleScreen({ onDone }: { onDone: () => void }) {
  const { legacy, refreshProfile } = useAuth();
  const { userId } = useIdentity();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const validErr = validateHandle(trimmed);
    if (validErr) { setError(validErr); return; }

    setPending(true);
    setError(null);
    try {
      if (!legacy) {
        await updateMyHandle(trimmed);
        await refreshProfile();
      } else {
        if (!userId) throw new Error("No user ID — please reload the page.");
        const u = await updateHandleByUserId(userId, trimmed);
        localStorage.setItem(HANDLE_KEY, u.handle);
      }
      onDone();
    } catch (err) {
      const msg = String(err);
      if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("already")) {
        setError("That handle is taken — try another one.");
      } else {
        setError(msg);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div
        className="gs-card"
        style={{
          maxWidth: 440, width: "100%",
          padding: "44px 48px",
          background: "var(--pastel-yellow)",
          boxShadow: "var(--shadow-block)",
        }}
      >
        <div style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: 60, lineHeight: 1, textAlign: "center", marginBottom: 18,
        }}>
          師
        </div>

        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: 24, textAlign: "center", marginBottom: 8,
        }}>
          Choose your handle
        </h2>

        <p style={{
          fontSize: 13, color: "var(--ink-soft)",
          textAlign: "center", lineHeight: 1.6, marginBottom: 28,
        }}>
          This is how you appear in games and on your profile.
          <br />You can change it later in your profile settings.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={value}
            onChange={e => { setValue(e.target.value); setError(null); }}
            placeholder="your-handle"
            maxLength={32}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            style={{
              padding: "11px 14px",
              border: `2.5px solid ${error ? "var(--tier-bad)" : "var(--ink)"}`,
              borderRadius: 10,
              fontSize: 15,
              fontFamily: "var(--font-mono)",
              background: "var(--bg-2)",
              color: "var(--ink)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />

          {error && (
            <p style={{ fontSize: 12, color: "var(--tier-bad)", margin: 0 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="gs-btn gs-btn--primary"
            disabled={pending || value.trim().length < 2}
            style={{ marginTop: 6, width: "100%" }}
          >
            {pending ? "Saving…" : "Set handle and continue →"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Gate component ────────────────────────────────────────────────────────────

interface HandleGateProps { children: ReactNode }

export function HandleGate({ children }: HandleGateProps) {
  const { ready, profile, legacy, user } = useAuth();
  const { userId } = useIdentity();
  const [confirmed, setConfirmed] = useState(false);

  if (!ready) return <>{children}</>;

  // Once the user explicitly sets their handle, stop gating.
  if (confirmed) return <>{children}</>;

  const needsHandle = (() => {
    if (legacy) {
      // Legacy mode: gate when userId exists but handle is temp ("user-{uid16}")
      const h = localStorage.getItem(HANDLE_KEY);
      return !!userId && isAutoHandle(h, userId);
    }
    // Auth mode: gate when signed in and handle is still the auto-generated default
    return !!user && !!profile && isAutoHandle(profile.handle, profile.id);
  })();

  if (needsHandle) {
    return <SetHandleScreen onDone={() => setConfirmed(true)} />;
  }

  return <>{children}</>;
}
