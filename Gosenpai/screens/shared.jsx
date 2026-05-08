// Shared bits: app shell, Go board renderer, sidebars
const { useState, useMemo } = React;

// ─── Go board ──────────────────────────────────────────────────────
// Renders a Go board as SVG. stones: [{x, y, c, mark?, ghost?}]
// mark: "good" | "ok" | "bad" | "last" | "best" | "letter:A"
function GoBoard({
  size = 9,
  stones = [],
  showCoords = false,
  width = 420,
  ownership = null,         // 2D array of -1..1
  highlight = null,         // {x, y, color}
  pad = 24,
  bg = "var(--bg-2)",
}) {
  const cell = (width - pad * 2) / (size - 1);
  const W = width;
  const H = width;

  const stars9 = [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
  const stars13 = [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]];
  const stars19 = [[3, 3], [3, 9], [3, 15], [9, 3], [9, 9], [9, 15], [15, 3], [15, 9], [15, 15]];
  const stars = size === 9 ? stars9 : size === 13 ? stars13 : stars19;

  const px = (i) => pad + i * cell;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* board background */}
      <rect x="0" y="0" width={W} height={H} fill={bg} stroke="var(--ink)" strokeWidth="2.5" rx="10" />

      {/* ownership wash */}
      {ownership && ownership.flat().map((v, i) => {
        const x = i % size, y = Math.floor(i / size);
        const a = Math.min(0.55, Math.abs(v));
        const c = v >= 0 ? "rgba(26,23,20," : "rgba(255,255,255,";
        return (
          <rect key={`o${i}`} x={px(x) - cell/2} y={px(y) - cell/2}
            width={cell} height={cell} fill={`${c}${a})`} />
        );
      })}

      {/* grid */}
      {Array.from({ length: size }).map((_, i) => (
        <line key={`h${i}`} x1={px(0)} y1={px(i)} x2={px(size - 1)} y2={px(i)}
          stroke="var(--ink)" strokeWidth="1.25" />
      ))}
      {Array.from({ length: size }).map((_, i) => (
        <line key={`v${i}`} x1={px(i)} y1={px(0)} x2={px(i)} y2={px(size - 1)}
          stroke="var(--ink)" strokeWidth="1.25" />
      ))}

      {/* star points */}
      {stars.map(([x, y], i) => (
        <circle key={`s${i}`} cx={px(x)} cy={px(y)} r="2.5" fill="var(--ink)" />
      ))}

      {/* coords */}
      {showCoords && Array.from({ length: size }).map((_, i) => (
        <g key={`c${i}`} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-mute)">
          <text x={px(i)} y={pad - 8} textAnchor="middle">{"ABCDEFGHJKLMNOPQRST"[i]}</text>
          <text x={pad - 10} y={px(i) + 3} textAnchor="end">{size - i}</text>
        </g>
      ))}

      {/* highlight square */}
      {highlight && (
        <rect x={px(highlight.x) - cell/2 + 2} y={px(highlight.y) - cell/2 + 2}
          width={cell - 4} height={cell - 4}
          fill="none" stroke={highlight.color || "var(--border-deep)"} strokeWidth="2.5" rx="4"
          strokeDasharray="3 3" />
      )}

      {/* stones */}
      {stones.map((s, i) => {
        const r = cell * 0.45;
        const cx = px(s.x), cy = px(s.y);
        if (s.ghost) {
          return (
            <circle key={`st${i}`} cx={cx} cy={cy} r={r}
              fill="none" stroke="var(--ink)" strokeWidth="1.5"
              strokeDasharray="3 3" opacity="0.6" />
          );
        }
        return (
          <g key={`st${i}`}>
            <circle cx={cx} cy={cy} r={r}
              fill={s.c === "b" ? "var(--ink)" : "var(--bg-2)"}
              stroke="var(--ink)" strokeWidth="2" />
            {s.num && (
              <text x={cx} y={cy + 3.5} textAnchor="middle"
                fontFamily="var(--font-display)" fontWeight="600" fontSize={cell * 0.36}
                fill={s.c === "b" ? "var(--bg-2)" : "var(--ink)"}>
                {s.num}
              </text>
            )}
            {/* tier dot */}
            {s.tier && (
              <circle cx={cx + r * 0.8} cy={cy - r * 0.8} r={cell * 0.14}
                fill={s.tier === "good" ? "var(--tier-good)" : s.tier === "ok" ? "var(--tier-ok)" : "var(--tier-bad)"}
                stroke="var(--ink)" strokeWidth="1.5" />
            )}
            {/* letter mark (best move A/B/C) */}
            {s.letter && (
              <g>
                <circle cx={cx} cy={cy} r={r * 0.62}
                  fill={s.letterBg || "var(--pastel-yellow)"} stroke="var(--ink)" strokeWidth="1.5" />
                <text x={cx} y={cy + 4} textAnchor="middle"
                  fontFamily="var(--font-display)" fontWeight="700" fontSize={cell * 0.34}
                  fill="var(--ink)">{s.letter}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── App shell (header + side rail) ─────────────────────────────────
function AppShell({ active = "home", children, onNav, frameless = false, width = 1280, height = 820 }) {
  const navItems = [
    { id: "home", label: "Home" },
    { id: "play", label: "Play" },
    { id: "viewer", label: "Review" },
    { id: "coach", label: "Sensei" },
    { id: "drill", label: "Drills" },
    { id: "concepts", label: "Library" },
  ];
  return (
    <div style={{
      width, height, background: "var(--bg)",
      display: "grid", gridTemplateRows: "auto 1fr",
      fontFamily: "var(--font-body)", color: "var(--ink)",
      overflow: "hidden",
    }}>
      {/* top bar */}
      <header style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "16px 28px", borderBottom: "3px solid var(--border)",
        background: "var(--bg-2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo />
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22,
            letterSpacing: "-0.02em", whiteSpace: "nowrap",
          }}>
            Go-senpai
          </div>
          <span className="gs-tag" style={{ background: "var(--pastel-yellow)" }}>ベータ · BETA</span>
        </div>

        <nav style={{ display: "flex", gap: 6, marginLeft: 20 }}>
          {navItems.map((n) => (
            <button key={n.id}
              onClick={() => onNav && onNav(n.id)}
              style={{
                fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
                padding: "8px 16px", borderRadius: 999,
                border: active === n.id ? "2.5px solid var(--ink)" : "2.5px solid transparent",
                background: active === n.id ? "var(--border)" : "transparent",
                color: "var(--ink)", cursor: "pointer",
                letterSpacing: "0.02em",
              }}>{n.label}</button>
          ))}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="gs-pill gs-pill--mint">
            <span style={{ width: 6, height: 6, background: "var(--tier-good)", borderRadius: 99, border: "1px solid var(--ink)" }} />
            KataGo · ready
          </span>
          <span className="gs-pill" style={{ background: "var(--pastel-lavender)" }}>9k · あなた</span>
          <div style={{
            width: 36, height: 36, borderRadius: 99, border: "2.5px solid var(--ink)",
            background: "var(--pastel-pink)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14,
          }}>R</div>
        </div>
      </header>

      <main style={{ overflow: "hidden", position: "relative" }}>
        {children}
      </main>
    </div>
  );
}

function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <rect x="2" y="2" width="36" height="36" rx="10" fill="var(--border)" stroke="var(--ink)" strokeWidth="2.5" />
      {/* board lines */}
      <line x1="11" y1="13" x2="29" y2="13" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="11" y1="20" x2="29" y2="20" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="11" y1="27" x2="29" y2="27" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="13" y1="11" x2="13" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="20" y1="11" x2="20" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
      <line x1="27" y1="11" x2="27" y2="29" stroke="var(--ink)" strokeWidth="1.5" />
      {/* stones */}
      <circle cx="13" cy="20" r="3.5" fill="var(--ink)" />
      <circle cx="20" cy="13" r="3.5" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="1.4" />
      <circle cx="20" cy="27" r="3.5" fill="var(--ink)" />
      <circle cx="27" cy="20" r="3.5" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="1.4" />
    </svg>
  );
}

// Big rotated section label like the Kimiko reference
function VerticalLabel({ text, color = "var(--bg)", size = 60, opacity = 1 }) {
  return (
    <div style={{
      writingMode: "vertical-rl",
      transform: "rotate(180deg)",
      fontFamily: "var(--font-display)",
      fontWeight: 700,
      fontSize: size,
      letterSpacing: "-0.03em",
      lineHeight: 1,
      color,
      opacity,
      whiteSpace: "nowrap",
      userSelect: "none",
    }}>{text}</div>
  );
}

Object.assign(window, { GoBoard, AppShell, Logo, VerticalLabel });
