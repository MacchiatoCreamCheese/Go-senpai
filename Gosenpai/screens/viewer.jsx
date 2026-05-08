// Game viewer — replay + analysis + LLM review
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

  // Mock ownership map (positive = black territory, negative = white)
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
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 380px", gap: 18, padding: 20, overflow: "hidden" }}>
      <div style={{ overflow: "auto", display: "grid", gap: 14, gridTemplateRows: "auto 1fr" }}>
        <ViewerHeader />
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 18, alignItems: "start" }}>
          {/* Board with overlays */}
          <div className="gs-card" style={{
            padding: 16, background: "var(--bg-2)",
            position: "relative",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <span className="gs-pill gs-pill--red">MOVE 13/47</span>
                <span className="gs-pill gs-pill--cyan">B · F6  ·  −2.4 pt</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="gs-btn" style={{ padding: "6px 10px", fontSize: 11 }}>ownership</button>
                <button className="gs-btn" style={{ padding: "6px 10px", fontSize: 11 }}>top moves</button>
                <button className="gs-btn" style={{ padding: "6px 10px", fontSize: 11 }}>heat</button>
              </div>
            </div>
            <GoBoard size={9} width={520} stones={stones} showCoords ownership={ownership}
              highlight={{ x: 5, y: 3, color: "var(--border-deep)" }} />

            {/* WR bar */}
            <WinRateBar />
          </div>

          {/* Move scrubber column */}
          <ScrubberColumn />
        </div>

        {/* Tabs */}
        <ViewerTabs />
      </div>

      {/* Right column — review + notes */}
      <div style={{ display: "grid", gap: 14, gridTemplateRows: "auto 1fr auto", overflow: "hidden" }}>
        <ReviewHeader />
        <ReviewBody />
        <NoteInput />
      </div>
    </div>
  );
}

function ViewerHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="gs-tag">GAME · #38</span>
          <span className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>ANALYSED · katago 500v</span>
          <span className="gs-tag" style={{ background: "var(--pastel-yellow)" }}>REVIEWED · gemini-2.5</span>
        </div>
        <h2 className="gs-display-700" style={{ margin: "8px 0 0", fontSize: 28, letterSpacing: "-0.02em" }}>
          Renatto (B) vs KataGo · 9k (W)
          <span style={{ marginLeft: 14, fontSize: 16, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>9×9 · komi 6.5 · L+0.5</span>
        </h2>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="gs-btn">↓ SGF</button>
        <button className="gs-btn gs-btn--primary">ask Sensei →</button>
      </div>
    </div>
  );
}

function WinRateBar() {
  // sample win-rate trajectory across 47 moves
  const N = 47;
  const wr = Array.from({ length: N }, (_, i) => {
    let v = 0.5;
    if (i < 8) v = 0.5 + i * 0.01;
    else if (i < 13) v = 0.58 - (i - 8) * 0.005;
    else if (i === 13) v = 0.36;       // blunder
    else if (i < 25) v = 0.36 + (i - 13) * 0.004;
    else if (i < 35) v = 0.42 + (i - 25) * 0.003;
    else v = 0.49 - (i - 35) * 0.002;
    return Math.max(0.05, Math.min(0.95, v));
  });
  const W = 520, H = 70;
  const path = wr.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (N - 1)) * W} ${H - v * H}`).join(" ");
  const fill = `${path} L ${W} ${H} L 0 ${H} Z`;
  return (
    <div style={{ marginTop: 14, border: "2px solid var(--ink)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--pastel-yellow)", borderBottom: "2px solid var(--ink)" }}>
        <span className="gs-tag" style={{ background: "transparent", border: "none", padding: 0 }}>WIN RATE · BLACK</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>peak 58% · low 36%  ·  3 blunders</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <line x1="0" y1={H/2} x2={W} y2={H/2} stroke="var(--ink-mute)" strokeDasharray="3 3" strokeWidth="1" />
        <path d={fill} fill="var(--pastel-pink)" opacity="0.7" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2.5" />
        {/* blunder markers */}
        <circle cx={(13/(N-1))*W} cy={H - wr[13]*H} r="6" fill="var(--tier-bad)" stroke="var(--ink)" strokeWidth="2" />
        <circle cx={(25/(N-1))*W} cy={H - wr[25]*H} r="5" fill="var(--tier-ok)" stroke="var(--ink)" strokeWidth="1.5" />
        <circle cx={(38/(N-1))*W} cy={H - wr[38]*H} r="5" fill="var(--tier-bad)" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function ScrubberColumn() {
  return (
    <div className="gs-card" style={{ padding: 14, background: "var(--pastel-cyan)", width: 200 }}>
      <div className="gs-tag" style={{ background: "var(--bg-2)" }}>NAVIGATE</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
        <button className="gs-btn" style={{ padding: 6 }}>⏮</button>
        <button className="gs-btn" style={{ padding: 6 }}>↶ −1</button>
        <button className="gs-btn gs-btn--primary" style={{ padding: 6 }}>+1 ↷</button>
        <button className="gs-btn" style={{ padding: 6 }}>⏭</button>
      </div>
      <div style={{ marginTop: 12, fontSize: 12 }}>
        <div className="gs-tag" style={{ background: "var(--bg-2)", marginBottom: 6 }}>TURNING POINTS</div>
        {[
          { m: 13, t: "−2.4 pt", c: "bad" },
          { m: 25, t: "−1.1 pt", c: "ok" },
          { m: 38, t: "−3.0 pt", c: "bad" },
        ].map((x, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 8px", marginTop: 4,
            border: "1.5px solid var(--ink)", borderRadius: 6,
            background: x.m === 13 ? "var(--bg-2)" : "rgba(255,255,255,0.5)",
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>move {x.m}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{x.t}</span>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: x.c === "bad" ? "var(--tier-bad)" : "var(--tier-ok)", border: "1.5px solid var(--ink)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewerTabs() {
  const tabs = [
    { id: "review", l: "LLM Review" },
    { id: "metrics", l: "Per-move metrics" },
    { id: "weakness", l: "Weakness contribution" },
    { id: "concepts", l: "Concepts referenced · 4" },
  ];
  return (
    <div className="gs-card" style={{ background: "var(--bg-2)", overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "2px solid var(--border)" }}>
        {tabs.map((t, i) => (
          <div key={t.id} style={{
            padding: "10px 18px",
            fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
            borderRight: "2px solid var(--border)",
            background: i === 1 ? "var(--pastel-yellow)" : "transparent",
            cursor: "pointer",
          }}>{t.l}</div>
        ))}
      </div>
      <div style={{ padding: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg)", textAlign: "left", fontFamily: "var(--font-mono)", color: "var(--ink-mute)" }}>
              {["#", "color", "coord", "Δ pts", "policy rank", "phase", "blunder?", "top"].map((h) => (
                <th key={h} style={{ padding: "8px 10px", borderBottom: "2px solid var(--ink)", fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              [11, "B", "D6", "-1.1", "3", "open", "·", "C5"],
              [12, "W", "D4", "-0.2", "1", "open", "·", "D4"],
              [13, "B", "F6", "-2.4", "8", "mid",  "✗", "E4"],
              [14, "W", "B6", "-0.0", "1", "mid",  "·", "B6"],
              [15, "B", "H4", "-0.6", "4", "mid",  "·", "G6"],
            ].map((r, i) => (
              <tr key={i} style={{ background: r[0] === 13 ? "var(--pastel-pink)" : "transparent" }}>
                {r.map((c, j) => (
                  <td key={j} style={{ padding: "8px 10px", borderBottom: "1px solid #e8e0d8", fontFamily: j === 0 || j === 2 || j === 3 || j === 4 ? "var(--font-mono)" : "inherit" }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewHeader() {
  return (
    <div className="gs-card" style={{ padding: 14, background: "var(--pastel-lavender)" }}>
      <div className="gs-tag">SENSEI'S REVIEW</div>
      <div style={{ marginTop: 8, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16 }}>
        Three turning points to study.
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-soft)" }}>
        Generated by gemini-2.5-flash, grounded on 47 KataGo positions.
      </div>
    </div>
  );
}

function ReviewBody() {
  const moments = [
    {
      m: 13, t: "Ignored opponent's reduction", c: "var(--pastel-pink)",
      body: "White's W12 at D5 was a sente reduction. F6 plays elsewhere and concedes ~2.4 pts. Better is E4, defending the corner.",
      tag: "ignores last move",
    },
    {
      m: 25, t: "Endgame timing", c: "var(--pastel-yellow)",
      body: "The push at H6 is small here. Your G3 stones still need a base — turn at G4 first.",
      tag: "endgame consistency",
    },
    {
      m: 38, t: "Missed forced sequence", c: "var(--pastel-cyan)",
      body: "There's a 3-move tesuji starting at B4 that gains 3 points in sente. Worth drilling.",
      tag: "reading depth",
    },
  ];
  return (
    <div className="gs-card" style={{ padding: 14, background: "var(--bg-2)", overflow: "auto" }}>
      <div style={{ display: "grid", gap: 10 }}>
        {moments.map((m, i) => (
          <div key={i} style={{
            border: "2px solid var(--ink)", borderRadius: 12,
            background: m.c, padding: "10px 12px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong className="gs-display-700" style={{ fontSize: 14 }}>{i + 1}. move {m.m} · {m.t}</strong>
              <span className="gs-tag" style={{ background: "var(--bg-2)" }}>{m.tag}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>{m.body}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button className="gs-btn" style={{ padding: "4px 10px", fontSize: 11 }}>jump to position</button>
              <button className="gs-btn" style={{ padding: "4px 10px", fontSize: 11 }}>study concept</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NoteInput() {
  return (
    <div className="gs-card" style={{ padding: 12, background: "var(--bg-2)" }}>
      <div className="gs-tag" style={{ marginBottom: 8 }}>YOUR NOTE · MOVE 13</div>
      <div style={{
        border: "2px dashed var(--ink-mute)",
        borderRadius: 8, padding: "8px 10px",
        fontSize: 13, fontFamily: "var(--font-body)",
        color: "var(--ink-mute)",
      }}>
        Why didn't I see W12 was sente? <span style={{ borderRight: "2px solid var(--ink)", marginLeft: 1 }}></span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>autosaved · 12s ago</span>
        <button className="gs-btn gs-btn--primary" style={{ padding: "4px 12px", fontSize: 11 }}>save</button>
      </div>
    </div>
  );
}

Object.assign(window, { ViewerScreen });
