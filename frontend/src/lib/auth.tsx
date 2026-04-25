import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase, supabaseEnabled } from "./supabase";
import { api, AUTH_401_EVENT, setAccessToken } from "./http";

export const USER_ID_KEY = "senpai_user_id";
export const HANDLE_KEY = "senpai_user_handle";

export interface BackendProfile {
  id: string;
  handle: string | null;
  email: string | null;
}

export function friendlyAuthError(raw: string): string {
  if (/email rate limit/i.test(raw)) {
    return "Email magic-links are rate-limited by Supabase. Try password sign-in or wait ~15 minutes.";
  }
  if (/invalid login credentials/i.test(raw)) {
    return "Wrong email or password. (Or your account uses magic-link / Google.)";
  }
  if (/user already registered/i.test(raw)) {
    return "An account with this email already exists. Switch to Sign in.";
  }
  return raw;
}

function persistProfile(p: BackendProfile) {
  localStorage.setItem(USER_ID_KEY, p.id);
  localStorage.setItem(HANDLE_KEY, p.handle ?? p.email ?? "");
}

interface AuthCtx {
  /** True once the initial session check has resolved. */
  ready: boolean;
  /** True when Supabase env vars are missing — fall back to legacy handle flow. */
  legacy: boolean;
  user: User | null;
  session: Session | null;
  /** Mirror of the backend's view of this user (handle/email/id). Null until
   *  the first /api/auth/me round-trip completes (or in legacy mode). */
  profile: BackendProfile | null;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Resolves the current user id from auth context, falling back to localStorage
 *  for the legacy handle flow when Supabase isn't configured. */
export function useIdentity(): { userId: string | null; displayName: string } {
  const { profile } = useAuth();
  const userId = profile?.id
    ?? (typeof window !== "undefined" ? localStorage.getItem(USER_ID_KEY) : null);
  const displayName = profile?.handle
    ?? profile?.email
    ?? (typeof window !== "undefined" ? localStorage.getItem(HANDLE_KEY) : null)
    ?? "Guest";
  return { userId, displayName };
}

async function fetchProfile(): Promise<BackendProfile | null> {
  try {
    const resp = await api("/api/auth/me");
    if (!resp.ok) return null;
    const body = await resp.json();
    return body.user ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<BackendProfile | null>(null);
  const [ready, setReady] = useState(!supabaseEnabled);
  const refreshAttemptedRef = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    // onAuthStateChange fires INITIAL_SESSION immediately, so no separate
    // getSession() call is needed.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAccessToken(s?.access_token ?? null);
      setReady(true);
      // Only reset on fresh sign-in/out — token refreshes shouldn't, otherwise
      // a backend outage triggers a refresh storm.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        refreshAttemptedRef.current = false;
      }
      if (!s) setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Re-fetch profile only when the underlying user changes — not on every
  // hourly token rotation.
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchProfile().then((p) => {
      if (cancelled || !p) return;
      setProfile(p);
      persistProfile(p);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!supabase) return;
    async function onAuth401() {
      if (refreshAttemptedRef.current) return;
      refreshAttemptedRef.current = true;
      const { data, error } = await supabase!.auth.refreshSession();
      if (error || !data.session) {
        await supabase!.auth.signOut();
        if (window.location.pathname !== "/login") {
          window.location.assign("/login");
        }
        return;
      }
      setSession(data.session);
      setAccessToken(data.session.access_token);
    }
    window.addEventListener(AUTH_401_EVENT, onAuth401);
    return () => window.removeEventListener(AUTH_401_EVENT, onAuth401);
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    ready,
    legacy: !supabaseEnabled,
    user: session?.user ?? null,
    session,
    profile,
    async signInWithEmail(email: string) {
      if (!supabase) return { error: "Supabase is not configured." };
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + "/" },
      });
      return { error: error?.message ?? null };
    },
    async signInWithPassword(email, password) {
      if (!supabase) return { error: "Supabase is not configured." };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signUpWithPassword(email, password) {
      if (!supabase) return { error: "Supabase is not configured.", needsConfirmation: false };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/" },
      });
      if (error) return { error: error.message, needsConfirmation: false };
      // Anti-enumeration: when the email already exists AND confirmation is
      // enabled, Supabase returns a user with empty `identities` instead of
      // erroring. Surface as a real error so users get a clear message.
      const identities = (data.user as { identities?: unknown[] } | null)?.identities;
      if (Array.isArray(identities) && identities.length === 0) {
        return {
          error: "An account with this email already exists. Switch to Sign in.",
          needsConfirmation: false,
        };
      }
      return { error: null, needsConfirmation: !data.session };
    },
    async signInWithGoogle() {
      if (!supabase) return { error: "Supabase is not configured." };
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/" },
      });
      return { error: error?.message ?? null };
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
      setAccessToken(null);
      setProfile(null);
      localStorage.removeItem(USER_ID_KEY);
      localStorage.removeItem(HANDLE_KEY);
    },
    async refreshProfile() {
      const p = await fetchProfile();
      if (p) {
        setProfile(p);
        persistProfile(p);
      }
    },
  }), [ready, userId, profile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
