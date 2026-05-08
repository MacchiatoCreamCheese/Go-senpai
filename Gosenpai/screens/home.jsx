// Home / Dashboard
const { useState: useStateHome } = React;

function HomeScreen() {
  return (
    <div style={{ height: "100%", overflow: "auto", padding: "24px 28px 40px", position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, maxWidth: 1240 }}>
        {/* HERO — Sensei card with prompt */}
        <SenseiHero />
        {/* Stats column */}
        <div style={{ display: "grid", gap: 16 }}>
          <StatBlock />
          <StreakBlock />
        </div>

        {/* Recent games */}
        <RecentGames />
        {/* Weakness panel */}
        <WeaknessPanel />

        {/* Quick play row spans full */}
        <div style={{ gridColumn: "1 / -1" }}>
          <QuickPlayRow />
        </div>
      </div>
    </div>
  );
}

function SenseiHero() {
  return (
    <div className="gs-card" style={{
      position: "relative",
      padding: "22px 24px 22px",
      background: "var(--pastel-cyan)",
      overflow: "hidden",
      minHeight: 250,
      display: "grid",
      gridTemplateColumns: "1fr 180px",
      gap: 18,
      alignItems: "center",
    }}>
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="gs-tag" style={{ background: "var(--bg-2)" }}>NEXT ACTION · 03</span>
          <span className="gs-sticker" style={{ background: "var(--pastel-yellow)" }}>
            先生 · TODAY'S PICK
          </span>
        </div>

        <h1 style={{
          fontFamily: "var(--font-display)", fontWeight: 700,
          fontSize: 38, lineHeight: 1.04, letterSpacing: "-0.025em",
          margin: "16px 0 6px",
        }}>
          Let's review<br />your last game.
        </h1>

        <p style={{
          margin: "0 0 14px", color: "var(--ink-soft)",
          fontSize: 14, lineHeight: 1.5,
        }}>
          You ignored opponent's threats around move 18. We'll walk through
          three turning points and one matching life-and-death drill.
        </p>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="gs-btn gs-btn--primary">Open review →</button>
          <button className="gs-btn">Skip · serve drill</button>
          <span className="gs-pill gs-pill--pink">⏱  ~12 min</span>
        </div>
      </div>

      {/* mini board on the right */}
      <div style={{
        transform: "rotate(-4deg)",
        justifySelf: "center",
      }}>
        <div className="gs-card gs-card--ink" style={{
          padding: 6, background: "var(--bg-2)",
          boxShadow: "var(--shadow-block-sm)",
        }}>
          <GoBoard size={9} width={170} stones={[
            { x: 4, y: 4, c: "b" }, { x: 4, y: 2, c: "w" },
            { x: 2, y: 4, c: "b" }, { x: 6, y: 4, c: "w" },
            { x: 4, y: 6, c: "b", tier: "bad" },
            { x: 6, y: 6, c: "w" }, { x: 2, y: 2, c: "b" },
            { x: 6, y: 2, c: "w" }, { x: 5, y: 5, c: "b" },
          ]} />
        </div>
      </div>
    </div>
  );
}

function StatBlock() {
  return (
    <div className="gs-card" style={{ padding: "18px 20px", background: "var(--pastel-yellow)" }}>
      <div className="gs-tag">RANK PROGRESS</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
        <span className="gs-display-700" style={{ fontSize: 56, lineHeight: 1 }}>9k</span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--ink-soft)" }}>
          → 8k in 14 wins
        </span>
      </div>
      <div className="gs-bar" style={{ marginTop: 12 }}><span style={{ width: "62%", background: "var(--ink)" }} /></div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        <span>62%</span><span>last 7d  +0.4 σ</span>
      </div>
    </div>
  );
}

function StreakBlock() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const filled = [1, 1, 1, 0, 1, 1, 1];
  return (
    <div className="gs-card" style={{ padding: "18px 20px", background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="gs-tag">DRILL STREAK</div>
        <span className="gs-display-700" style={{ fontSize: 22 }}>6 days 🔥</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "space-between" }}>
        {days.map((d, i) => (
          <div key={i} style={{
            width: 38, height: 46, borderRadius: 10,
            border: "2px solid var(--ink)",
            background: filled[i] ? "var(--pastel-green)" : "var(--bg)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-display)", fontWeight: 600,
          }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{d}</span>
            {filled[i] ? <span style={{ fontSize: 10 }}>✓</span> : <span style={{ fontSize: 10, color: "var(--ink-mute)" }}>·</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentGames() {
  const games = [
    { id: 1, you: "you", opp: "KataGo · 8k", board: 9, result: "L+0.5", color: "B", date: "today", new: true, tier: "bad" },
    { id: 2, you: "you", opp: "shino7", board: 9, result: "W+8.5", color: "W", date: "yesterday", new: false, tier: "good" },
    { id: 3, you: "you", opp: "KataGo · 9k", board: 13, result: "L+R", color: "B", date: "2d ago", new: false, tier: "ok" },
  ];
  return (
    <div className="gs-card" style={{ padding: 20, background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="gs-section-h">RECENT GAMES</div>
        <button className="gs-btn" style={{ padding: "6px 14px", fontSize: 12 }}>see all 38 →</button>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {games.map((g) => (
          <div key={g.id} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 14, alignItems: "center",
            padding: "10px 14px",
            border: "2px solid var(--ink)", borderRadius: 12,
            background: g.new ? "var(--pastel-pink)" : "var(--bg)",
          }}>
            <div style={{
              width: 44, height: 44,
              border: "2px solid var(--ink)", borderRadius: 8,
              display: "grid", placeItems: "center",
              background: g.color === "B" ? "var(--ink)" : "var(--bg-2)",
              color: g.color === "B" ? "var(--bg-2)" : "var(--ink)",
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18,
            }}>{g.color}</div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>
                vs {g.opp}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>
                {g.board}×{g.board}  ·  {g.date}  ·  {g.result}
              </div>
            </div>
            <span className={`gs-pill ${g.tier === "good" ? "gs-pill--mint" : g.tier === "ok" ? "gs-pill--yellow" : "gs-pill--red"}`}>
              {g.tier === "good" ? "well played" : g.tier === "ok" ? "decent" : "lost ground"}
            </span>
            {g.new
              ? <button className="gs-btn gs-btn--primary" style={{ padding: "6px 14px", fontSize: 12 }}>review</button>
              : <button className="gs-btn" style={{ padding: "6px 14px", fontSize: 12 }}>open</button>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

function WeaknessPanel() {
  const themes = [
    { t: "Ignores opponent's last move", v: 0.74, color: "var(--border)" },
    { t: "Opening blunders", v: 0.41, color: "var(--pastel-peach)" },
    { t: "Top-move avoidance", v: 0.36, color: "var(--pastel-yellow)" },
    { t: "Endgame consistency", v: 0.22, color: "var(--pastel-green)" },
    { t: "Middlegame fights", v: 0.12, color: "var(--pastel-cyan)" },
    { t: "Slow opening tempo", v: 0.08, color: "var(--pastel-lavender)" },
  ];
  return (
    <div className="gs-card" style={{ padding: 20, background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="gs-section-h">WEAKNESSES · 弱点</div>
        <span className="gs-pill gs-pill--cyan">EMA · last 30d</span>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {themes.map((th, i) => (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontFamily: "var(--font-display)", fontWeight: 500 }}>{th.t}</span>
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{th.v.toFixed(2)}</span>
            </div>
            <div className="gs-bar"><span style={{ width: `${th.v * 100}%`, background: th.color }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickPlayRow() {
  const cards = [
    { title: "Quick AI · 9×9", sub: "training mode on", color: "var(--pastel-cyan)", tag: "FAST", emoji: "▶" },
    { title: "Find a human", sub: "live lobby · 12 waiting", color: "var(--pastel-pink)", tag: "PvP", emoji: "👥" },
    { title: "Tsumego of the day", sub: "5-stone life · easy", color: "var(--pastel-yellow)", tag: "DRILL", emoji: "◇" },
    { title: "Resume game #38", sub: "your move · move 47", color: "var(--pastel-green)", tag: "LIVE", emoji: "↻" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
      {cards.map((c, i) => (
        <button key={i} className="gs-card" style={{
          padding: "16px 18px", textAlign: "left",
          background: c.color, cursor: "pointer",
          border: "3px solid var(--border)",
          fontFamily: "var(--font-body)",
          color: "var(--ink)",
          transition: "transform .1s",
        }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translate(-2px,-2px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translate(0,0)"}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="gs-tag">{c.tag}</span>
            <span style={{ fontSize: 22 }}>{c.emoji}</span>
          </div>
          <div className="gs-display-700" style={{ fontSize: 22, marginTop: 14, lineHeight: 1.05 }}>{c.title}</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>{c.sub}</div>
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { HomeScreen });
