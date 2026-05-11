import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { HANDLE_KEY, useAuth } from "../lib/auth";
import { HandleGate } from "../components/HandleGate";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/lobby", label: "Play" },
  { to: "/games", label: "Review" },
  { to: "/coach", label: "Sensei" },
  { to: "/drill", label: "Drills" },
  { to: "/concepts", label: "Library" },
];

function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <rect x="2" y="2" width="36" height="36" rx="10" fill="var(--border)" stroke="var(--ink)" strokeWidth="2.5" />
      <line x1="11" y1="13" x2="29" y2="13" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="11" y1="20" x2="29" y2="20" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="11" y1="27" x2="29" y2="27" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="13" y1="11" x2="13" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="20" y1="11" x2="20" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="27" y1="11" x2="27" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="13" cy="20" r="3.5" fill="var(--ink)" />
      <circle cx="20" cy="13" r="3.5" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="1.4" />
      <circle cx="20" cy="27" r="3.5" fill="var(--ink)" />
      <circle cx="27" cy="20" r="3.5" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="1.4" />
    </svg>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, legacy, signOut } = useAuth();
  const [legacyHandle, setLegacyHandle] = useState(
    () => localStorage.getItem(HANDLE_KEY) ?? "",
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (legacy) setLegacyHandle(localStorage.getItem(HANDLE_KEY) ?? "");
  }, [location.pathname, legacy]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".user-menu")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const displayName = legacy
    ? legacyHandle || "Guest"
    : user
      ? profile?.handle ?? profile?.email ?? user.email ?? "Signed in"
      : "Sign in";

  const initial = displayName.charAt(0).toUpperCase();
  const isSignedIn = legacy ? !!legacyHandle : !!user;

  async function handleSignOut() {
    await signOut();
    setLegacyHandle("");
    setMenuOpen(false);
    navigate(legacy ? "/lobby" : "/login");
  }

  return (
    <div className="shell">
      <header className="shell-nav">
          {/* Logo + brand */}
          <NavLink to="/" className="shell-logo" end>
            <Logo />
            <span className="shell-logo-text">Go-senpai</span>
            <span className="gs-tag" style={{ background: "var(--pastel-yellow)" }}>ベータ · BETA</span>
          </NavLink>

          {/* Nav links */}
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

          {/* Right side: status + user */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span className="gs-pill gs-pill--mint">
              <span style={{
                width: 6, height: 6, background: "var(--tier-good)",
                borderRadius: 99, border: "1.5px solid var(--ink)", flexShrink: 0,
              }} />
              KataGo · ready
            </span>

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
                <div style={{
                  width: 32, height: 32, borderRadius: 99,
                  border: "2.5px solid var(--ink)",
                  background: "var(--pastel-pink)",
                  display: "grid", placeItems: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700, fontSize: 14,
                  flexShrink: 0,
                }}>
                  {initial}
                </div>
                <span className="shell-user-name">{displayName}</span>
                {isSignedIn && <span className="shell-user-caret">▾</span>}
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
          </div>
        </header>

      <main className="shell-main">
        <HandleGate>
          <Outlet />
        </HandleGate>
      </main>
    </div>
  );
}
