import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import { useAuth } from "../lib/auth";
import { AuthLoading } from "../components/AuthLoading";

interface Props { children: ReactNode }

/** Wraps a route subtree. Redirects to /login when Supabase is configured and
 *  the user is not signed in. When legacy (Supabase env missing) it lets the
 *  child render — the legacy handle flow handles identity itself. */
export function RequireAuth({ children }: Props) {
  const { ready, legacy, user } = useAuth();
  const location = useLocation();

  if (!ready) return <AuthLoading />;
  if (legacy) return <>{children}</>;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
