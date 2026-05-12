import { useState } from "react";
import type { ReactNode } from "react";

import { HANDLE_KEY, SETUP_DONE_KEY, useAuth, useIdentity } from "../lib/auth";
import { updateMyHandle, updateHandleByUserId } from "../api";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function SetHandleScreen({
  onDone,
  email,
  defaultHandle,
}: {
  onDone: () => void;
  email: string | null;
  defaultHandle: string;
}) {
  const { legacy, refreshProfile } = useAuth();
  const { userId } = useIdentity();
  const [name, setName] = useState(defaultHandle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function markDone() {
    if (userId) localStorage.setItem(`${SETUP_DONE_KEY}_${userId}`, "1");
    onDone();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();

    if (trimmed && trimmed !== defaultHandle) {
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
      } catch (err) {
        const msg = String(err);
        if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("already")) {
          setError("That username is taken — try another one.");
        } else {
          setError(msg);
        }
        setPending(false);
        return;
      }
      setPending(false);
    }

    markDone();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        display: "flex",
        gap: 20,
        width: "100%",
        maxWidth: 860,
        flexWrap: "wrap",
        alignItems: "flex-start",
      }}>
        {/* Main card */}
        <div className="panel panel--ink" style={{
          flex: "1 1 360px",
          padding: "32px 36px",
          background: "var(--pastel-cyan)",
          boxShadow: "var(--shadow-block)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}>
          <span className="gs-sticker">WELCOME</span>

          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, lineHeight: 1.1, marginBottom: 8 }}>
              What should we call you?
            </h1>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.55 }}>
              Signed in as <strong>{email ?? "your account"}</strong>. Add a user name — or skip and jump straight in.<br />
              You can change it later in profile settings.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="login-label" htmlFor="display-name">
              User name <span style={{ fontWeight: 400, color: "var(--ink-mute)" }}>(optional)</span>
            </label>
            <input
              id="display-name"
              className="input"
              type="text"
              placeholder={defaultHandle || "Your name or nickname"}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e as unknown as React.FormEvent); }}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            {error && (
              <p style={{ fontSize: 12, color: "var(--tier-bad)", margin: 0 }}>{error}</p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="gs-btn gs-btn--primary"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={pending}
              onClick={handleSubmit as unknown as React.MouseEventHandler}
            >
              {pending ? "Saving…" : "Get Started →"}
            </button>
            <button
              className="gs-btn"
              style={{ width: "100%", justifyContent: "center", background: "transparent", fontSize: 13 }}
              onClick={markDone}
            >
              skip for now →
            </button>
          </div>
        </div>

        {/* Feature highlights */}
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { color: "var(--pastel-yellow)",   tag: "AI COACH", title: "Sensei knows your game", body: "Get next-move hints and post-game reviews powered by KataGo." },
            { color: "var(--pastel-green)",    tag: "DRILL",    title: "Tsumego every day",     body: "Sharpen your reading with life-and-death problems." },
            { color: "var(--pastel-lavender)", tag: "LEARN",    title: "Concept library",       body: "Study joseki, fuseki, and key Go ideas at your own pace." },
          ].map((f) => (
            <div key={f.tag} className="panel panel--ink" style={{
              padding: "16px 20px",
              background: f.color,
              boxShadow: "var(--shadow-block-sm)",
            }}>
              <span className="gs-tag" style={{ marginBottom: 8, display: "inline-block" }}>{f.tag}</span>
              <div className="gs-display-700" style={{ fontSize: 16, marginBottom: 4 }}>{f.title}</div>
              <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
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
  if (confirmed) return <>{children}</>;

  const skipped = userId ? !!localStorage.getItem(`${SETUP_DONE_KEY}_${userId}`) : false;

  const needsHandle = (() => {
    if (legacy) {
      const h = localStorage.getItem(HANDLE_KEY);
      return !!userId && isAutoHandle(h, userId);
    }
    return !!user && !!profile && isAutoHandle(profile.handle, profile.id);
  })();

  if (needsHandle && !skipped) {
    return (
      <SetHandleScreen
        onDone={() => setConfirmed(true)}
        email={profile?.email ?? user?.email ?? null}
        defaultHandle={profile?.handle ?? (legacy ? (localStorage.getItem(HANDLE_KEY) ?? "") : "")}
      />
    );
  }

  return <>{children}</>;
}
