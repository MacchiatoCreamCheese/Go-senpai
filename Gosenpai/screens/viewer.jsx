// Game Viewer — chess.com-style: board left, AI chat (top) + move list (bottom) right
const { useState: useStateViewer } = React;

function ViewerScreen() {
  const stones = [
    { x: 2, y: 2, c: "b", num: 1 }, { x: 6, y: 6, c: "w", num: 2 },
    { x: 6, y: 2, c: "b", num: 3 }, { x: 2, y: 6, c: "w", num: 4 },
    { x: 4, y: 4, c: "b", num: 5 }, { x: 4, y: 2, c: "w", num: 6 },
    { x: 4, y: 6, c: "b", num: 7 }, { x: 2, y: 4, c: "w", num: 8 },
    { x: 6, y: 4, c: "b", num: 9 },
    { x: 5, y: 5, c: "w", num: 10 },
    { x: 3, y: 3, c: "b", num: 11 },
    { x: 3, y: 5, c: "w", num: 12 },
    { x: 5, y: 3, c: "b", num: 13 },
    // ghost suggestions
    { x: 4, y: 3, ghost: true, c: "b", letter: "A", letterBg: "var(--pastel-green)" },
    { x: 5, y: 4, ghost: true, c: "b", letter: "B", letterBg: "var(--pastel-yellow)" },
    { x: 1, y: 5, ghost: true, c: "b", letter: "C", letterBg: "var(--pastel-pink)" },
  ];

  const ownership = Array.from({ length: 9 }, (_, y) =>
    Array.from({ length: 9 }, (_, x) => {
      if (y < 3 && x < 4) return 0.6;
      if (y < 4 && x > 5) return 0.4;
      if (y > 5 && x < 3) return -0.5;
      if (y > 5 && x > 5) return -0.7;
      return 0;
    })
  );

  return (
    <div style={{
      height: "100%", display: "grid",
      gridTemplateColumns: "1fr 400px",
      gap: 16, padding: 18, overflow: "hidden",
    }}>
      {/* ─── LEFT: board column ─── */}
      <div style={{
        display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 10,
        minWidth: 0, overflow: "hidden",
      }}>
        <ViewerHeader />
        <PlayerStripV name="KataGo · 9k" rank="9k" color="W" result="W+0.5" />
        <BoardWithOverlays stones={stones} ownership={ownership} />
        <PlayerStripV name="Renatto" rank="9k" color="B" result="L+0.5" you active />
      </div>

      {/* ─── RIGHT: AI chat (top) + Move list (bottom) ─── */}
      <div style={{
        display: "grid", gridTemplateRows: "1fr 1fr", gap: 12,
        minHeight: 0, overflow: "hidden",
      }}>
        <ReviewChat />
        <MoveListReview />
      </div>
    </div>
  );
}

function ViewerHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="gs-tag">GAME · #38</span>
        <span className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>katago · 500v</span>
        <span className="gs-tag" style={{ background: "var(--pastel-yellow)" }}>gemini-2.5</span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, marginLeft: 6 }}>
          Renatto (B) vs KataGo · 9k (W)
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>
          · 9×9 · komi 6.5
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="gs-btn" style={{ padding: "6px 12px", fontSize: 12 }}>↓ SGF</button>
        <button className="gs-btn gs-btn--primary" style={{ padding: "6px 12px", fontSize: 12 }}>share</button>
      </div>
    </div>
  );
}

function PlayerStripV({ name, rank, color, result, you, active }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12,
      padding: "8px 12px",
      background: active ? "var(--pastel-yellow)" : "var(--bg-2)",
      border: `2.5px solid ${active ? "var(--ink)" : "var(--border)"}`,
      borderRadius: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        border: "2.5px solid var(--ink)",
        background: color === "B" ? "var(--ink)" : "var(--bg-2)",
        color: color === "B" ? "var(--bg-2)" : "var(--ink)",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15,
      }}>{color}</div>
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{name}</span>
          {you && <span className="gs-tag" style={{ background: "var(--pastel-pink)" }}>YOU</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-mute)" }}>· {rank}</span>
        </div>
      </div>
      <div style={{
        padding: "5px 12px", border: "2.5px solid var(--ink)", borderRadius: 10,
        fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13,
        background: active ? "var(--bg-2)" : "var(--bg)",
      }}>{result}</div>
    </div>
  );
}

function BoardWithOverlays({ stones, ownership }) {
  return (
    <div style={{ display: "grid", placeItems: "center", position: "relative", minHeight: 0 }}>
      <div className="gs-card" style={{
        padding: 12, background: "var(--bg-2)",
        boxShadow: "var(--shadow-block)", position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <span className="gs-pill gs-pill--red">MOVE 13/47</span>
            <span className="gs-pill gs-pill--cyan">B · F6 · −2.4 pt</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="gs-btn" style={{ padding: "4px 8px", fontSize: 10 }}>ownership</button>
            <button className="gs-btn" style={{ padding: "4px 8px", fontSize: 10 }}>top moves</button>
          </div>
        </div>
        <GoBoard size={9} width={480} stones={stones} showCoords ownership={ownership}
          highlight={{ x: 5, y: 3, color: "var(--border-deep)" }} />
        <WinRateBar />
        <ScrubberBar />
      </div>
    </div>
  );
}

function WinRateBar() {
  const N = 47;
  const wr = Array.from({ length: N }, (_, i) => {
    let v = 0.5;
    if (i < 8) v = 0.5 + i * 0.01;
    else if (i < 13) v = 0.58 - (i - 8) * 0.005;
    else if (i === 13) v = 0.36;
    else if (i < 25) v = 0.36 + (i - 13) * 0.004;
    else if (i < 35) v = 0.42 + (i - 25) * 0.003;
    else v = 0.49 - (i - 35) * 0.002;
    return Math.max(0.05, Math.min(0.95, v));
  });
  const W = 480, H = 50;
  const path = wr.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (N - 1)) * W} ${H - v * H}`).join(" ");
  const fill = `${path} L ${W} ${H} L 0 ${H} Z`;
  return (
    <div style={{ marginTop: 10, border: "2px solid var(--ink)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", background: "var(--pastel-yellow)", borderBottom: "2px solid var(--ink)" }}>
        <span className="gs-tag" style={{ background: "transparent", border: "none", padding: 0 }}>WIN RATE · BLACK</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>peak 58% · low 36% · 3 blunders</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <line x1="0" y1={H/2} x2={W} y2={H/2} stroke="var(--ink-mute)" strokeDasharray="3 3" strokeWidth="1" />
        <path d={fill} fill="var(--pastel-pink)" opacity="0.7" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
        <circle cx={(13/(N-1))*W} cy={H - wr[13]*H} r="5" fill="var(--tier-bad)" stroke="var(--ink)" strokeWidth="2" />
        <circle cx={(25/(N-1))*W} cy={H - wr[25]*H} r="4" fill="var(--tier-ok)" stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={(38/(N-1))*W} cy={H - wr[38]*H} r="4" fill="var(--tier-bad)" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function ScrubberBar() {
  return (
    <div style={{
      marginTop: 8, display: "grid", gridTemplateColumns: "auto auto 1fr auto auto", gap: 6, alignItems: "center",
    }}>
      <button className="gs-btn" style={{ padding: "6px 10px", fontSize: 12 }}>⏮</button>
      <button className="gs-btn" style={{ padding: "6px 10px", fontSize: 12 }}>↶</button>
      <span style={{
        textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
        padding: "5px 10px", border: "2px solid var(--ink)", borderRadius: 8, background: "var(--bg)",
      }}>move 13 / 47</span>
      <button className="gs-btn gs-btn--primary" style={{ padding: "6px 10px", fontSize: 12 }}>↷</button>
      <button className="gs-btn" style={{ padding: "6px 10px", fontSize: 12 }}>⏭</button>
    </div>
  );
}

function ReviewChat() {
  return (
    <div className="gs-card" style={{
      background: "var(--bg-2)", overflow: "hidden",
      display: "grid", gridTemplateRows: "auto 1fr auto", minHeight: 0,
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: "2px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "var(--pastel-lavender)",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            width: 28, height: 28, borderRadius: 99,
            background: "var(--ink)", color: "var(--bg-2)",
            border: "2px solid var(--ink)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11,
          }}>先</div>
          <div>
            <div className="gs-display-700" style={{ fontSize: 13 }}>Ask Sensei</div>
            <div style={{ fontSize: 10, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>grounded · 47 positions</div>
          </div>
        </div>
        <span className="gs-pill gs-pill--mint" style={{ fontSize: 10, padding: "2px 8px" }}>streaming</span>
      </div>

      {/* Messages */}
      <div style={{ padding: 12, overflow: "auto", display: "grid", gap: 10, alignContent: "start" }}>
        <ChatBubble side="left">
          Move 13 (F6) lost ~2.4 pts. White's W12 at D5 was sente — playing elsewhere
          conceded the corner. Better was <code style={monoSm}>E4</code>.
        </ChatBubble>

        <ChatBubble side="right">why did E4 work?</ChatBubble>

        <ChatBubble side="left">
          Three reasons:
          <ol style={{ margin: "6px 0 0 16px", padding: 0, lineHeight: 1.5, fontSize: 12 }}>
            <li>It defends the corner base.</li>
            <li>It threatens hane at <code style={monoSm}>D3</code>.</li>
            <li>The capture race becomes 4 vs 3 — you win by one.</li>
          </ol>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ChatChipSm primary>show variation</ChatChipSm>
            <ChatChipSm>next blunder</ChatChipSm>
          </div>
        </ChatBubble>

        <ChatBubble side="left" typing>counting liberties around F4…</ChatBubble>
      </div>

      {/* Input */}
      <div style={{ padding: 10, borderTop: "2px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          <ChatChipSm>what's missing?</ChatChipSm>
          <ChatChipSm>my plan?</ChatChipSm>
          <ChatChipSm>read fight</ChatChipSm>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
          <input placeholder="ask about move 13…"
            style={{
              border: "2px solid var(--ink)", borderRadius: 10,
              padding: "6px 10px", fontFamily: "var(--font-body)", fontSize: 12,
              background: "var(--bg)", outline: "none",
            }} />
          <button className="gs-btn gs-btn--primary" style={{ padding: "4px 12px", fontSize: 11 }}>↵</button>
        </div>
      </div>
    </div>
  );
}

const monoSm = { fontFamily: "var(--font-mono)", fontSize: 11, padding: "1px 4px", background: "var(--bg)", border: "1px solid var(--ink-mute)", borderRadius: 3 };

function ChatBubble({ side, children, typing }) {
  const isLeft = side === "left";
  return (
    <div style={{ display: "flex", justifyContent: isLeft ? "flex-start" : "flex-end" }}>
      <div style={{
        maxWidth: "88%",
        padding: "8px 12px",
        border: "2px solid var(--ink)",
        borderRadius: 12,
        background: isLeft ? "var(--pastel-cyan)" : "var(--pastel-pink)",
        fontSize: 12, lineHeight: 1.45,
        fontStyle: typing ? "italic" : "normal",
        opacity: typing ? 0.75 : 1,
      }}>
        {typing && <span style={{ marginRight: 4 }}>···</span>}
        {children}
      </div>
    </div>
  );
}

function ChatChipSm({ children, primary }) {
  return (
    <span style={{
      padding: "3px 9px",
      border: "1.5px solid var(--ink)", borderRadius: 999,
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 10.5,
      background: primary ? "var(--ink)" : "var(--bg-2)",
      color: primary ? "var(--bg-2)" : "var(--ink)",
      cursor: "pointer", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function MoveListReview() {
  // chess.com-style algebraic pairs with tier coloring
  const pairs = [
    { b: "C7", bt: "good", w: "G3", wt: "good" },
    { b: "G7", bt: "good", w: "C3", wt: "good" },
    { b: "E5", bt: "good", w: "E7", wt: "ok" },
    { b: "E3", bt: "good", w: "C5", wt: "good" },
    { b: "G5", bt: "good", w: "F4", wt: "ok" },
    { b: "D6", bt: "ok",   w: "D4", wt: "good" },
    { b: "F6", bt: "bad",  w: "B6", wt: "good", current: true },
    { b: "H4", bt: "ok",   w: "G6", wt: "good" },
    { b: "B3", bt: "good", w: "B4", wt: "good" },
    { b: "A5", bt: "ok",   w: "B5", wt: "good" },
    { b: "H6", bt: "good", w: "H7", wt: "good" },
    { b: "G2", bt: "bad",  w: "F2", wt: "good" },
  ];
  return (
    <div className="gs-card" style={{
      background: "var(--bg-2)", overflow: "hidden",
      display: "grid", gridTemplateRows: "auto auto 1fr",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="gs-tag">MOVES · 47</div>
        <div style={{ display: "flex", gap: 4 }}>
          <span className="gs-pill" style={{ background: "var(--bg)", padding: "2px 8px", fontSize: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--tier-good)", border: "1px solid var(--ink)" }} />
            38
          </span>
          <span className="gs-pill" style={{ background: "var(--bg)", padding: "2px 8px", fontSize: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--tier-ok)", border: "1px solid var(--ink)" }} />
            6
          </span>
          <span className="gs-pill" style={{ background: "var(--bg)", padding: "2px 8px", fontSize: 10 }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--tier-bad)", border: "1px solid var(--ink)" }} />
            3
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 1fr", padding: "6px 12px", background: "var(--bg)", borderBottom: "2px solid var(--ink)" }}>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-mute)", textTransform: "uppercase" }}>#</span>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-mute)", textTransform: "uppercase" }}>● black</span>
        <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-mute)", textTransform: "uppercase" }}>○ white</span>
      </div>

      <div style={{ overflow: "auto" }}>
        {pairs.map((p, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "44px 1fr 1fr", alignItems: "center",
            padding: "5px 12px",
            background: i % 2 ? "var(--bg)" : "transparent",
            borderBottom: "1px solid #efe7dc",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>{i + 1}.</span>
            <MoveCell coord={p.b} tier={p.bt} current={p.current} />
            <MoveCell coord={p.w} tier={p.wt} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveCell({ coord, tier, current }) {
  const tColor = tier === "good" ? "var(--tier-good)" : tier === "ok" ? "var(--tier-ok)" : "var(--tier-bad)";
  return (
    <span style={{
      display: "inline-flex", gap: 6, alignItems: "center",
      padding: "2px 8px", borderRadius: 6,
      background: current ? "var(--pastel-pink)" : "transparent",
      border: current ? "1.5px solid var(--ink)" : "1.5px solid transparent",
      width: "fit-content", cursor: "pointer",
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12 }}>{coord}</span>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: tColor, border: "1px solid var(--ink)" }} />
    </span>
  );
}

Object.assign(window, { ViewerScreen });
