import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { friendlyAuthError, useAuth } from "../lib/auth";
import { AuthLoading } from "../components/AuthLoading";

type Tab = "password" | "magic";

export default function Login() {
  const {
    user,
    legacy,
    ready,
    signInWithEmail,
    signInWithPassword,
    signUpWithPassword,
    signInWithGoogle,
  } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [tab, setTab] = useState<Tab>("password");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <AuthLoading />;
  if (user) return <Navigate to={from} replace />;
  if (legacy) {
    return (
      <div className="login-page">
        <div className="login-card">
          <span className="home-eyebrow">Identity</span>
          <h1 className="login-title">Set up Supabase</h1>
          <p className="login-body">
            This build is missing <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>. Until they're set, identity falls
            back to the handle-based system on the Lobby page.
          </p>
        </div>
      </div>
    );
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "signin") {
        const { error: err } = await signInWithPassword(email.trim(), password);
        if (err) setError(friendlyAuthError(err));
      } else {
        const { error: err, needsConfirmation } = await signUpWithPassword(email.trim(), password);
        if (err) setError(friendlyAuthError(err));
        else if (needsConfirmation) setConfirmSent(true);
      }
    } finally {
      setPending(false);
    }
  }

  async function submitMagic(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error: err } = await signInWithEmail(email.trim());
    setPending(false);
    if (err) setError(friendlyAuthError(err));
    else setMagicSent(true);
  }

  async function googleSignIn() {
    setError(null);
    setPending(true);
    const { error: err } = await signInWithGoogle();
    setPending(false);
    if (err) setError(friendlyAuthError(err));
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <span className="home-eyebrow">{mode === "signup" ? "Create account" : "Sign in"}</span>
        <h1 className="login-title">先生 — your coach awaits</h1>

        {confirmSent ? (
          <div className="login-sent">
            <p>
              Account created for <strong>{email}</strong>. Check your inbox to confirm
              the address, then come back and sign in.
            </p>
            <button className="link-btn" onClick={() => { setConfirmSent(false); setMode("signin"); }}>
              Back to sign in
            </button>
          </div>
        ) : magicSent ? (
          <div className="login-sent">
            <p>
              A magic link is on its way to <strong>{email}</strong>. Open it on this
              device to finish signing in.
            </p>
            <button className="link-btn" onClick={() => { setMagicSent(false); setEmail(""); }}>
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="login-google"
              onClick={googleSignIn}
              disabled={pending}
            >
              <span className="login-google-mark" aria-hidden="true" />
              Continue with Google
            </button>

            <div className="login-divider">or</div>

            <div className="login-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "password"}
                className={"login-tab" + (tab === "password" ? " is-active" : "")}
                onClick={() => { setTab("password"); setError(null); }}
              >
                Password
              </button>
              <button
                role="tab"
                aria-selected={tab === "magic"}
                className={"login-tab" + (tab === "magic" ? " is-active" : "")}
                onClick={() => { setTab("magic"); setError(null); }}
              >
                Magic link
              </button>
            </div>

            {tab === "password" ? (
              <form onSubmit={submitPassword} className="login-form">
                <label className="login-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />

                <label className="login-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                />

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={pending || !email.trim() || password.length < 6}
                >
                  {pending
                    ? (mode === "signup" ? "Creating…" : "Signing in…")
                    : (mode === "signup" ? "Create account" : "Sign in")}
                </button>

                <p className="login-fineprint">
                  {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
                  <button
                    type="button"
                    className="login-toggle-link"
                    onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
                  >
                    {mode === "signin" ? "Create one" : "Sign in"}
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={submitMagic} className="login-form">
                <label className="login-label" htmlFor="magic-email">Email</label>
                <input
                  id="magic-email"
                  className="input"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={pending || !email.trim()}
                >
                  {pending ? "Sending…" : "Send magic link"}
                </button>
                <p className="login-fineprint">
                  No password. We email you a one-time link that signs you in.
                </p>
              </form>
            )}

            {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}

            <p className="login-fineprint" style={{ marginTop: 16, color: "var(--stone)" }}>
              First time? Choose any method — we'll create your account automatically.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
