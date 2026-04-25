import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { HANDLE_KEY, useAuth } from "../lib/auth";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/lobby", label: "Lobby" },
  { to: "/coach", label: "Coach" },
  { to: "/drill", label: "Drill" },
  { to: "/games", label: "Games" },
  { to: "/concepts", label: "Concepts" },
  { to: "/profile", label: "Profile" },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, legacy, signOut } = useAuth();
  const [legacyHandle, setLegacyHandle] = useState(
    () => localStorage.getItem(HANDLE_KEY) ?? "",
  );
  const [menuOpen, setMenuOpen] = useState(false);

  // Re-read legacy handle when location changes (lobby flow may set it).
  useEffect(() => {
    if (legacy) setLegacyHandle(localStorage.getItem(HANDLE_KEY) ?? "");
  }, [location.pathname, legacy]);

  // Close menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".user-menu")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const minimalChrome = location.pathname.startsWith("/play/");

  const displayName = legacy
    ? legacyHandle || "Guest"
    : user
      ? profile?.handle ?? profile?.email ?? user.email ?? "Signed in"
      : "Sign in";

  const isSignedIn = legacy ? !!legacyHandle : !!user;

  async function handleSignOut() {
    await signOut();
    setLegacyHandle("");
    setMenuOpen(false);
    navigate(legacy ? "/lobby" : "/login");
  }

  return (
    <div className="shell">
      {!minimalChrome && (
        <header className="shell-nav">
          <NavLink to="/" className="shell-logo" end>
            <span className="shell-logo-mark" aria-hidden="true">碁</span>
            <span className="shell-logo-text">Go-senpai</span>
          </NavLink>

          <nav className="shell-nav-links" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  "shell-nav-link" + (isActive ? " is-active" : "")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="user-menu">
            <button
              className="shell-user"
              onClick={() => {
                if (!isSignedIn && !legacy) {
                  navigate("/login");
                  return;
                }
                setMenuOpen((v) => !v);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="shell-user-dot" aria-hidden="true" />
              <span className="shell-user-name">{displayName}</span>
              {isSignedIn && <span className="shell-user-caret" aria-hidden="true">▾</span>}
            </button>
            {menuOpen && isSignedIn && (
              <div className="user-menu-pop" role="menu">
                <button
                  className="user-menu-item"
                  onClick={() => { setMenuOpen(false); navigate("/profile"); }}
                >
                  Profile
                </button>
                <button
                  className="user-menu-item"
                  onClick={() => { setMenuOpen(false); navigate("/settings"); }}
                >
                  Settings
                </button>
                <div className="user-menu-rule" />
                <button
                  className="user-menu-item user-menu-item-muted"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      <main className="shell-main">
        <Outlet />
      </main>

      {!minimalChrome && (
        <NavLink to="/coach" className="coach-fab" aria-label="Open coach">
          <span className="coach-fab-mark">先</span>
          <span className="coach-fab-label">Coach</span>
        </NavLink>
      )}
    </div>
  );
}
