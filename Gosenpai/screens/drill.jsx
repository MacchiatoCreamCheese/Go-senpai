// Drill (Tsumego) screen
function DrillScreen() {
  const stones = [
    // life-and-death problem (sample)
    { x: 0, y: 0, c: "w" }, { x: 1, y: 0, c: "w" }, { x: 2, y: 0, c: "w" },
    { x: 3, y: 0, c: "b" }, { x: 4, y: 0, c: "b" }, { x: 5, y: 0, c: "b" },
    { x: 0, y: 1, c: "w" }, { x: 1, y: 1, c: "w" }, { x: 2, y: 1, c: "b" },
    { x: 3, y: 1, c: "b" }, { x: 5, y: 1, c: "b" },
    { x: 0, y: 2, c: "b" }, { x: 1, y: 2, c: "b" }, { x: 2, y: 2, c: "b" },
    { x: 3, y: 2, c: "b" }, { x: 4, y: 2, c: "b" }, { x: 5, y: 2, c: "b" },
    // candidate
    { x: 4, y: 1, ghost: true, c: "w", letter: "?", letterBg: "var(--pastel-yellow)" },
  ];

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "320px 1fr 320px", gap: 18, padding: 20, overflow: "hidden" }}>
      {/* Left — context */}
      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <div className="gs-card" style={{ padding: 16, background: "var(--pastel-pink)" }}>
          <div className="gs-tag" style={{ background: "var(--bg-2)" }}>WHY THIS PROBLEM</div>
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5 }}>
            You missed a 5-stone life shape in <strong>game #38, move 13</strong>.
            This problem is the <em>same shape on a smaller corner</em> — solve it three times and we'll
            mark the concept as demonstrated.
          </p>
        </div>

        <div className="gs-card" style={{ padding: 16, background: "var(--bg-2)" }}>
          <div className="gs-tag">PROBLEM META</div>
          <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 13 }}>
            <Row2 k="id" v="starter-04-twopoint-eye" mono />
            <Row2 k="theme" v="life · corner" />
            <Row2 k="difficulty" v="20 kyu" />
            <Row2 k="best time" v="0:42" />
            <Row2 k="solved" v="5,234 times" />
          </div>
        </div>

        <div className="gs-card" style={{ padding: 16, background: "var(--pastel-yellow)" }}>
          <div className="gs-tag" style={{ background: "var(--bg-2)" }}>SHARE LINK</div>
          <div style={{
            marginTop: 8, padding: "8px 10px",
            background: "var(--bg-2)", border: "2px solid var(--ink)", borderRadius: 8,
            fontFamily: "var(--font-mono)", fontSize: 11,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>/api/problems/starter-04…</span>
            <span style={{ cursor: "pointer" }}>copy</span>
          </div>
        </div>
      </div>

      {/* Center — board + prompt */}
      <div style={{ display: "grid", placeItems: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, display: "flex", gap: 10 }}>
          <span className="gs-sticker" style={{ background: "var(--pastel-cyan)" }}>
            ◇  WHITE TO PLAY · KILL THE GROUP
          </span>
        </div>

        <div className="gs-card" style={{
          padding: 14, background: "var(--bg-2)",
          boxShadow: "var(--shadow-block)",
          marginTop: 28,
        }}>
          <GoBoard size={9} width={460} stones={stones} showCoords highlight={{ x: 4, y: 1, color: "var(--border-deep)" }} />
        </div>

        {/* attempt counter */}
        <div style={{ position: "absolute", bottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <span className="gs-pill" style={{ background: "var(--bg-2)" }}>attempt 1 / 3</span>
          <span className="gs-pill gs-pill--mint">⏱ 0:18</span>
          <span className="gs-pill" style={{ background: "var(--pastel-yellow)" }}>no hint used</span>
        </div>
      </div>

      {/* Right — moves played + actions */}
      <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
        <div className="gs-card" style={{ padding: 16, background: "var(--bg-2)" }}>
          <div className="gs-section-h">PROMPT</div>
          <p style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.5 }}>
            White's group on the second line has only one eye-shape so far.
            Play the <strong>vital point</strong> that prevents Black from making two eyes.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span className="gs-tag" style={{ background: "var(--pastel-green)" }}>VITAL POINT</span>
            <span className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>EYE SHAPE</span>
            <span className="gs-tag" style={{ background: "var(--pastel-pink)" }}>2-EYE LIFE</span>
          </div>
        </div>

        <div className="gs-card" style={{ padding: 16, background: "var(--bg-2)" }}>
          <div className="gs-section-h">YOUR MOVES</div>
          <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
            {[
              { n: 1, c: "w", coord: "E2", note: "tried the throw-in", res: "✗" },
              { n: 2, c: "b", coord: "F2", note: "expected reply", res: "·" },
              { n: 3, c: "w", coord: "—", note: "thinking…", res: "?" },
            ].map((m, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px",
                border: "1.5px solid var(--ink)", borderRadius: 8,
                background: m.res === "✗" ? "var(--pastel-pink)" : m.res === "?" ? "var(--pastel-yellow)" : "var(--bg)",
              }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-mute)" }}>{m.n}.</span>
                <span style={{
                  width: 14, height: 14, borderRadius: 99,
                  background: m.c === "b" ? "var(--ink)" : "var(--bg-2)",
                  border: "1.5px solid var(--ink)",
                }} />
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{m.coord}</span>
                <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: "auto" }}>{m.note}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{m.res}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <button className="gs-btn">💡 hint · −1 stamp</button>
          <button className="gs-btn">↶ undo</button>
          <button className="gs-btn">skip · serve next</button>
          <button className="gs-btn gs-btn--primary">submit answer →</button>
        </div>
      </div>
    </div>
  );
}

function Row2({ k, v, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed var(--ink-mute)", padding: "3px 0" }}>
      <span style={{ color: "var(--ink-mute)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{k}</span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-display)", fontWeight: 500, fontSize: 13 }}>{v}</span>
    </div>
  );
}

Object.assign(window, { DrillScreen });
