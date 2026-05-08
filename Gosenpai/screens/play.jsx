// Live Play screen — chess.com-style sandwich layout + classic 3-col, tweakable
const { useState: useStatePlay } = React;

function PlayScreen({ tweaks = {} }) {
  const layout = tweaks.layout || "sandwich";       // "sandwich" | "studio"
  const tierStyle = tweaks.tierStyle || "dot";       // "dot" | "ring" | "off"
  const showMiku = tweaks.showMiku !== false;
  const showCoords = tweaks.showCoords !== false;
  const boardSize = tweaks.boardSize || 9;

  return layout === "sandwich"
    ? <PlaySandwich tierStyle={tierStyle} showMiku={showMiku} showCoords={showCoords} boardSize={boardSize} />
    : <PlayStudio   tierStyle={tierStyle} showMiku={showMiku} showCoords={showCoords} boardSize={boardSize} />;
}

// ───────────── shared sample data ─────────────
function sampleStones(tierStyle = "dot") {
  const tierFor = (t) => tierStyle === "off" ? null : t;
  return [
    { x: 2, y: 2, c: "b", num: 1 }, { x: 6, y: 6, c: "w", num: 2 },
    { x: 6, y: 2, c: "b", num: 3 }, { x: 2, y: 6, c: "w", num: 4 },
    { x: 4, y: 4, c: "b", num: 5 }, { x: 4, y: 2, c: "w", num: 6 },
    { x: 4, y: 6, c: "b", num: 7 }, { x: 2, y: 4, c: "w", num: 8 },
    { x: 6, y: 4, c: "b", num: 9, tier: tierFor("good") },
    { x: 5, y: 5, c: "w", num: 10 },
    { x: 3, y: 3, c: "b", num: 11, tier: tierFor("ok") },
    { x: 3, y: 5, c: "w", num: 12 },
    { x: 5, y: 3, c: "b", num: 15, tier: tierFor("bad") },
    { x: 1, y: 3, c: "w", num: 14 },
    { x: 7, y: 5, c: "b", num: 13 },
  ];
}

// ───────────── SANDWICH (chess.com-style) ─────────────
function PlaySandwich({ tierStyle, showMiku, showCoords, boardSize }) {
  const [tab, setTab] = useStatePlay("moves");
  const stones = sampleStones(tierStyle);

  return (
    <div style={{
      height: "100%",
      display: "grid",
      gridTemplateColumns: showMiku ? "200px 1fr 360px" : "1fr 360px",
      gap: 16, padding: 18, overflow: "hidden",
    }}>
      {/* Left: vibe / Miku */}
      {showMiku && (
        <div style={{ display: "grid", gap: 12, alignContent: "start", overflow: "hidden" }}>
          <MikuStandee />
          <VibeChip />
        </div>
      )}

      {/* Center: opponent → board → you  (chess.com sandwich) */}
      <div style={{
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 10,
        minWidth: 0, justifyItems: "center",
      }}>
        <SandwichPlayer name="KataGo · 9k" rank="9k" color="W" time="04:12" thinking captures={2} />

        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <div className="gs-card" style={{ padding: 12, background: "var(--bg-2)", boxShadow: "var(--shadow-block)" }}>
            <GoBoard size={boardSize} width={520} stones={stones} showCoords={showCoords}
              highlight={{ x: 5, y: 3, color: "var(--border-deep)" }} />
          </div>
          {tierStyle !== "off" && (
            <div style={{ position: "absolute", top: -6, left: 12 }}>
              <span className="gs-pill" style={{ background: "var(--pastel-cyan)" }}>
                ⊙ training mode
              </span>
            </div>
          )}
        </div>

        <SandwichPlayer name="Renatto" rank="9k" color="B" time="06:48" you captures={0} active />
      </div>

      {/* Right: tabbed panel — moves / notes / sensei */}
      <div className="gs-card" style={{
        background: "var(--bg-2)", overflow: "hidden",
        display: "grid", gridTemplateRows: "auto auto 1fr auto",
      }}>
        {/* tabs */}
        <div style={{ display: "flex", borderBottom: "2px solid var(--border)" }}>
          {[
            { id: "moves", l: "Moves · 15" },
            { id: "notes", l: "Notes · 2" },
            { id: "sensei", l: "Sensei" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 12px",
              fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12,
              border: "none",
              borderRight: "2px solid var(--border)",
              borderBottom: tab === t.id ? "3px solid var(--ink)" : "none",
              background: tab === t.id ? "var(--pastel-yellow)" : "transparent",
              color: "var(--ink)",
              cursor: "pointer",
              letterSpacing: "0.02em",
            }}>{t.l}</button>
          ))}
        </div>

        {/* meta strip */}
        <div style={{ padding: "8px 12px", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", borderBottom: "1.5px dashed var(--ink-mute)" }}>
          <span className="gs-tag">9×9</span>
          <span className="gs-tag">komi 6.5</span>
          <span className="gs-tag">CHN</span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-mute)", marginLeft: "auto" }}>
            game #38
          </span>
        </div>

        {/* tab content */}
        <div style={{ overflow: "auto" }}>
          {tab === "moves" && <MoveListChess />}
          {tab === "notes" && <NotesPane />}
          {tab === "sensei" && <SenseiPane />}
        </div>

        {/* action row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: 10, borderTop: "2px solid var(--border)" }}>
          <button className="gs-btn" style={{ padding: "8px 0", fontSize: 12 }}>↶</button>
          <button className="gs-btn" style={{ padding: "8px 0", fontSize: 12 }}>pass</button>
          <button className="gs-btn gs-btn--red" style={{ padding: "8px 0", fontSize: 12 }}>resign</button>
        </div>
      </div>
    </div>
  );
}

// chess.com-style player card — wide, single line, big clock on the right
function SandwichPlayer({ name, rank, color, time, thinking, you, captures = 0, active }) {
  return (
    <div style={{
      width: 560,
      display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12,
      padding: "8px 12px",
      background: active ? "var(--pastel-yellow)" : "var(--bg-2)",
      border: active ? "2.5px solid var(--ink)" : "2.5px solid var(--border)",
      borderRadius: 14,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        border: "2.5px solid var(--ink)",
        background: color === "B" ? "var(--ink)" : "var(--bg-2)",
        color: color === "B" ? "var(--bg-2)" : "var(--ink)",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
      }}>{color}</div>
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>{name}</span>
          {you && <span className="gs-tag" style={{ background: "var(--pastel-pink)" }}>YOU</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)" }}>· {rank} · captures {captures}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--font-display)", fontWeight: 500 }}>
          {thinking ? "thinking…" : "your move"}
        </div>
      </div>
      <div style={{
        padding: "8px 14px", border: "2.5px solid var(--ink)", borderRadius: 12,
        background: thinking ? "var(--pastel-cyan)" : active ? "var(--bg-2)" : "var(--bg)",
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 22,
        minWidth: 84, textAlign: "center",
      }}>{time}</div>
    </div>
  );
}

function MoveListChess() {
  // 2 columns: "1.  C7    G3"  like chess.com algebraic pairs
  const pairs = [
    ["C7", "G3"], ["G7", "C3"], ["E5", "E7"],
    ["E3", "C5"], ["G5", "F4"], ["D6", "D4"],
    ["F6*", "B6"], ["H4", "—"],
  ];
  return (
    <div style={{ padding: "6px 0" }}>
      {pairs.map(([b, w], i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "44px 1fr 1fr", alignItems: "center",
          padding: "5px 12px",
          background: i % 2 ? "var(--bg)" : "transparent",
          borderBottom: "1px solid #efe7dc",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>{i + 1}.</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13,
            color: b.includes("*") ? "var(--ink)" : "var(--ink)",
            background: b.includes("*") ? "var(--pastel-pink)" : "transparent",
            padding: "2px 6px", borderRadius: 4,
            border: b.includes("*") ? "1.5px solid var(--ink)" : "1.5px solid transparent",
            display: "inline-block", width: "fit-content",
          }}>{b.replace("*", "")}</span>
          <span style={{
            fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13,
            background: i === pairs.length - 1 ? "var(--pastel-yellow)" : "transparent",
            padding: "2px 6px", borderRadius: 4,
            border: i === pairs.length - 1 && w !== "—" ? "1.5px solid var(--ink)" : "1.5px solid transparent",
            display: "inline-block", width: "fit-content",
            color: w === "—" ? "var(--ink-mute)" : "var(--ink)",
          }}>{w}</span>
        </div>
      ))}
    </div>
  );
}

function NotesPane() {
  return (
    <div style={{ padding: 12, display: "grid", gap: 8 }}>
      <div className="gs-tag" style={{ background: "var(--pastel-lavender)" }}>STRATEGY · fed to AI</div>
      {[
        { m: 5, t: "build influence on the right side first, then invade lower left" },
        { m: 11, t: "watch for the cut at D5 — leave a sente threat" },
      ].map((n, i) => (
        <div key={i} style={{
          padding: "8px 10px",
          border: "2px solid var(--ink)", borderRadius: 10,
          background: "var(--pastel-lavender)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
              padding: "1px 6px", border: "1px solid var(--ink)", borderRadius: 4,
              background: "var(--bg-2)" }}>m{n.m}</span>
            <span style={{ fontSize: 10, color: "var(--ink-mute)", cursor: "pointer" }}>×</span>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>{n.t}</div>
        </div>
      ))}
      <div style={{
        marginTop: 4, display: "grid", gridTemplateColumns: "1fr auto", gap: 6,
      }}>
        <input placeholder="jot a plan for this move…"
          style={{ border: "2px dashed var(--ink)", borderRadius: 8, padding: "6px 8px",
            fontFamily: "var(--font-body)", fontSize: 12, background: "var(--bg-2)", outline: "none" }} />
        <button className="gs-btn" style={{ padding: "4px 10px", fontSize: 11 }}>+ pin</button>
      </div>
    </div>
  );
}

function SenseiPane() {
  return (
    <div style={{ padding: 12, display: "grid", gap: 8 }}>
      <div className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>ASK SENSEI · 先生</div>
      <button style={askChipStyle("var(--pastel-pink)")}>
        <span style={askChipIcon}>?</span> What am I missing? <span style={askArr}>→</span>
      </button>
      <button style={askChipStyle("var(--pastel-yellow)")}>
        <span style={askChipIcon}>◎</span> What's my plan? <span style={askArr}>→</span>
      </button>
      <button style={askChipStyle("var(--pastel-green)")}>
        <span style={askChipIcon}>⚔</span> Help me read this fight <span style={askArr}>→</span>
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginTop: 6 }}>
        <input placeholder="ask anything…"
          style={{ border: "2px solid var(--ink)", borderRadius: 10, padding: "7px 10px",
            fontFamily: "var(--font-body)", fontSize: 12, background: "var(--bg)", outline: "none" }} />
        <button className="gs-btn gs-btn--primary" style={{ padding: "6px 10px", fontSize: 11 }}>↵</button>
      </div>
      <div style={{ marginTop: 4, padding: "8px 10px", border: "2px solid var(--ink)", borderRadius: 10, background: "var(--pastel-cyan)", fontSize: 11.5, lineHeight: 1.4 }}>
        <strong style={{ fontFamily: "var(--font-display)" }}>Sensei:</strong>{" "}
        Move 13 (B F6) lost ~2.4 pts. Tap to see why after the game.
      </div>
    </div>
  );
}

const askChipStyle = (color) => ({
  display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 8, alignItems: "center",
  padding: "8px 10px",
  border: "2px solid var(--ink)", borderRadius: 10,
  background: color, cursor: "pointer", textAlign: "left",
  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
  color: "var(--ink)",
});
const askChipIcon = {
  width: 22, height: 22, borderRadius: 999,
  background: "var(--bg-2)", border: "1.5px solid var(--ink)",
  display: "grid", placeItems: "center", fontSize: 12,
};
const askArr = { fontSize: 13, opacity: 0.6 };

function VibeChip() {
  return (
    <div className="gs-card" style={{ padding: "10px 12px", background: "var(--pastel-pink)" }}>
      <div className="gs-tag" style={{ background: "var(--bg-2)" }}>VIBE</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <span className="gs-pill" style={{ background: "var(--bg-2)" }}>lo-fi · 24/7</span>
        <span className="gs-pill" style={{ background: "var(--bg-2)" }}>♪ on</span>
      </div>
    </div>
  );
}

// ───────────── STUDIO (the original 3-col rich layout, slightly compacted) ─────────────
function PlayStudio({ tierStyle, showMiku, showCoords, boardSize }) {
  const stones = sampleStones(tierStyle);
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "260px 1fr 340px", gap: 16, padding: 20, overflow: "hidden" }}>
      <div style={{ display: "grid", gap: 12, alignContent: "start", overflow: "hidden" }}>
        <PlayerCard name="KataGo · 9k" rank="9k" color="W" time="04:12" thinking captures={2} />
        <PlayerCard name="Renatto" rank="9k" color="B" time="06:48" you captures={0} active />
        {showMiku && <MikuStandee />}
        <GameInfo />
      </div>
      <div style={{ display: "grid", placeItems: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <span className="gs-sticker" style={{ background: "var(--pastel-cyan)" }}>
            ⊙  TRAINING MODE · live coaching tier dots
          </span>
        </div>
        <div className="gs-card" style={{ padding: 14, background: "var(--bg-2)", boxShadow: "var(--shadow-block)", marginTop: 28 }}>
          <GoBoard size={boardSize} width={520} stones={stones} showCoords={showCoords} highlight={{ x: 5, y: 3, color: "var(--border-deep)" }} />
        </div>
        <div style={{ position: "absolute", bottom: 10, display: "flex", gap: 10 }}>
          <TierLegend tier="good" label="ideal" />
          <TierLegend tier="ok" label="ok" />
          <TierLegend tier="bad" label="lost ≥ 2pt" />
        </div>
      </div>
      <div style={{ display: "grid", gap: 12, alignContent: "start", overflow: "hidden", gridTemplateRows: "auto auto 1fr auto" }}>
        <AskAILive />
        <StrategyNotes />
        <MoveList />
        <ActionRow />
      </div>
    </div>
  );
}

// ───────────── pieces shared by Studio layout ─────────────
function PlayerCard({ name, rank, color, time, thinking, you, captures = 0, active }) {
  return (
    <div className="gs-card" style={{
      padding: "12px 14px",
      background: active ? "var(--pastel-yellow)" : "var(--bg-2)",
      borderColor: active ? "var(--ink)" : "var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 99,
          border: "2.5px solid var(--ink)",
          background: color === "B" ? "var(--ink)" : "var(--bg-2)",
          color: color === "B" ? "var(--bg-2)" : "var(--ink)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16,
        }}>{color}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14 }}>
            {name} {you && <span className="gs-tag" style={{ marginLeft: 4, background: "var(--pastel-pink)" }}>YOU</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>
            captured · {captures}  ·  {rank}
          </div>
        </div>
      </div>
      <div style={{
        marginTop: 8, padding: "6px 10px",
        border: "2px solid var(--ink)", borderRadius: 10,
        background: thinking ? "var(--pastel-cyan)" : "var(--bg)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 700 }}>{time}</span>
        {thinking
          ? <span style={{ fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 600 }}>thinking…</span>
          : <span style={{ fontSize: 11, fontFamily: "var(--font-display)", color: "var(--ink-mute)" }}>your turn</span>
        }
      </div>
    </div>
  );
}

function GameInfo() {
  return (
    <div className="gs-card" style={{ padding: "12px 14px", background: "var(--bg-2)" }}>
      <div className="gs-tag">GAME · #38</div>
      <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.6 }}>
        <Row k="board" v="9 × 9" />
        <Row k="komi" v="6.5" />
        <Row k="rules" v="Chinese" />
        <Row k="time" v="10 min + 30s" />
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--ink-mute)", padding: "2px 0" }}>
      <span style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{k}</span>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: 13 }}>{v}</span>
    </div>
  );
}

function TierLegend({ tier, label }) {
  const c = tier === "good" ? "var(--tier-good)" : tier === "ok" ? "var(--tier-ok)" : "var(--tier-bad)";
  return (
    <span className="gs-pill" style={{ background: "var(--bg-2)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 99, background: c, border: "1.5px solid var(--ink)" }} />
      {label}
    </span>
  );
}

function MikuStandee() {
  return (
    <div className="gs-card" style={{
      padding: 0, background: "var(--pastel-cyan)",
      overflow: "hidden", position: "relative",
      minHeight: 220,
    }}>
      <div style={{
        position: "absolute", top: 8, left: 10, right: 10,
        display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2,
      }}>
        <span className="gs-tag" style={{ background: "var(--bg-2)" }}>LIVE2D · 初音ミク</span>
        <span className="gs-pill" style={{ background: "var(--bg-2)", padding: "2px 8px", fontSize: 10 }}>
          <span style={{ width: 6, height: 6, background: "var(--tier-good)", borderRadius: 99, border: "1px solid var(--ink)" }} />
          idle
        </span>
      </div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "end center" }}>
        <MikuPlaceholder />
      </div>
      <div style={{ position: "absolute", bottom: 8, left: 10 }}>
        <span style={{
          padding: "3px 8px", border: "1.5px solid var(--ink)", borderRadius: 999,
          background: "var(--bg-2)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 10,
        }}>emote: ◔ ◡ ◔</span>
      </div>
    </div>
  );
}

function MikuPlaceholder() {
  return (
    <svg viewBox="0 0 160 220" width="160" height="220" style={{ display: "block" }}>
      <path d="M40 70 Q30 130 36 200 L48 198 Q44 130 52 80 Z" fill="var(--pastel-mint)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M120 70 Q130 130 124 200 L112 198 Q116 130 108 80 Z" fill="var(--pastel-mint)" stroke="var(--ink)" strokeWidth="2" />
      <ellipse cx="80" cy="60" rx="34" ry="36" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M48 50 Q50 22 80 18 Q110 22 112 50 Q100 36 80 36 Q60 36 48 50 Z" fill="var(--pastel-mint)" stroke="var(--ink)" strokeWidth="2.5" />
      <ellipse cx="68" cy="62" rx="3.5" ry="5" fill="var(--ink)" />
      <ellipse cx="92" cy="62" rx="3.5" ry="5" fill="var(--ink)" />
      <circle cx="69" cy="60" r="1.2" fill="var(--bg-2)" />
      <circle cx="93" cy="60" r="1.2" fill="var(--bg-2)" />
      <path d="M75 76 Q80 80 85 76" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M62 96 L80 104 L98 96 L96 110 L80 116 L64 110 Z" fill="var(--border)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M52 110 Q56 108 64 110 L80 118 L96 110 Q104 108 108 110 L116 200 L44 200 Z" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="2.5" />
      <rect x="76" y="116" width="8" height="40" fill="var(--pastel-yellow)" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M52 112 L40 170 L52 174 L62 116 Z" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M108 112 L120 170 L108 174 L98 116 Z" fill="var(--bg-2)" stroke="var(--ink)" strokeWidth="2" />
      <text x="80" y="218" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="8" fill="var(--ink-mute)">live2d · placeholder rig</text>
    </svg>
  );
}

function AskAILive() {
  return (
    <div className="gs-card" style={{ padding: 12, background: "var(--bg-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>ASK SENSEI · 先生</div>
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        <button style={askChipStyle("var(--pastel-pink)")}><span style={askChipIcon}>?</span>What am I missing?<span style={askArr}>→</span></button>
        <button style={askChipStyle("var(--pastel-yellow)")}><span style={askChipIcon}>◎</span>What's my plan?<span style={askArr}>→</span></button>
        <button style={askChipStyle("var(--pastel-green)")}><span style={askChipIcon}>⚔</span>Help me read this fight<span style={askArr}>→</span></button>
      </div>
    </div>
  );
}

function StrategyNotes() {
  const notes = [
    { m: 5, t: "build influence on the right side first" },
    { m: 11, t: "watch for the cut at D5 — leave sente" },
  ];
  return (
    <div className="gs-card" style={{ padding: 10, background: "var(--pastel-lavender)" }}>
      <div className="gs-tag" style={{ background: "var(--bg-2)" }}>STRATEGY · fed to AI</div>
      <div style={{ display: "grid", gap: 5, marginTop: 6 }}>
        {notes.map((n, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 6, alignItems: "center",
            padding: "5px 8px", border: "1.5px solid var(--ink)", borderRadius: 8, background: "var(--bg-2)",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
              padding: "1px 5px", border: "1px solid var(--ink)", borderRadius: 4, background: "var(--pastel-yellow)" }}>m{n.m}</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{n.t}</span>
            <span style={{ fontSize: 10, color: "var(--ink-mute)", cursor: "pointer" }}>×</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveList() {
  const moves = [
    ["C7","good"],["G3","good"],["G7","good"],["C3","good"],["E5","good"],["E7","ok"],
    ["E3","good"],["C5","good"],["G5","good"],["F4","ok"],["D6","ok"],["D4","good"],
    ["F6","bad"],["B6","good"],["H4","ok"],
  ];
  return (
    <div className="gs-card" style={{ background: "var(--bg-2)", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <div style={{ padding: "8px 12px", borderBottom: "2px solid var(--border)" }}>
        <div className="gs-tag">MOVES · 15</div>
      </div>
      <div style={{ overflow: "auto", padding: 8, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4 }}>
        {moves.map((m, i) => {
          const tColor = m[1] === "good" ? "var(--tier-good)" : m[1] === "ok" ? "var(--tier-ok)" : "var(--tier-bad)";
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 7px", border: "1.5px solid var(--ink)", borderRadius: 6,
              background: i === 14 ? "var(--pastel-yellow)" : "var(--bg)",
            }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)", minWidth: 16 }}>{i + 1}</span>
              <span style={{
                width: 12, height: 12, borderRadius: 99,
                background: i % 2 === 0 ? "var(--ink)" : "var(--bg-2)",
                border: "1.5px solid var(--ink)",
              }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{m[0]}</span>
              <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: 99, background: tColor, border: "1px solid var(--ink)" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionRow() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      <button className="gs-btn" style={{ padding: "8px 0", fontSize: 12 }}>↶ undo</button>
      <button className="gs-btn" style={{ padding: "8px 0", fontSize: 12 }}>pass</button>
      <button className="gs-btn gs-btn--red" style={{ padding: "8px 0", fontSize: 12 }}>resign</button>
      <button className="gs-btn gs-btn--primary" style={{ padding: "8px 0", fontSize: 12 }}>確定</button>
    </div>
  );
}

Object.assign(window, { PlayScreen });
