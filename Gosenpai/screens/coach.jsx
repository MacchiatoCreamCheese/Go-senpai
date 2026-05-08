// Coach (Sensei) — next action card + Ask Sensei chat + drill view
function CoachScreen() {
  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, padding: 20, overflow: "hidden" }}>
      {/* Left: planner state + action history */}
      <div style={{ display: "grid", gap: 14, gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
        <NextActionCard />
        <ActionHistory />
      </div>

      {/* Right: Ask Sensei chat */}
      <AskSensei />
    </div>
  );
}

function NextActionCard() {
  return (
    <div className="gs-card" style={{ padding: 22, background: "var(--pastel-yellow)", position: "relative", overflow: "hidden" }}>
      {/* big rotated label */}
      <div style={{ position: "absolute", right: -6, top: -8, opacity: 0.18 }}>
        <span className="gs-display-700" style={{ fontSize: 130, letterSpacing: "-0.04em" }}>SENSEI</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="gs-tag" style={{ background: "var(--bg-2)" }}>NEXT ACTION</span>
        <span className="gs-pill gs-pill--ink">teach_concept</span>
        <span className="gs-pill" style={{ background: "var(--bg-2)" }}>severity 0.74</span>
      </div>

      <h2 className="gs-display-700" style={{ fontSize: 32, lineHeight: 1.06, margin: "12px 0 6px", letterSpacing: "-0.02em", maxWidth: 460 }}>
        Study the concept of <em style={{ background: "var(--bg-2)", border: "2.5px solid var(--ink)", padding: "0 8px", borderRadius: 6, fontStyle: "normal", boxShadow: "var(--shadow-block-sm)" }}>sente vs. gote</em>.
      </h2>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--ink-soft)", maxWidth: 460, lineHeight: 1.5 }}>
        We picked this because <strong>"ignores opponent's last move"</strong> has crossed 0.7
        across your last 5 games. The orchestrator skipped review_game because game #38 was
        already reviewed.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="gs-btn gs-btn--primary">read concept · 4 min</button>
        <button className="gs-btn">drill instead</button>
        <button className="gs-btn">why this?</button>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "var(--bg-2)", border: "2px solid var(--ink)", borderRadius: 10 }}>
        <div className="gs-tag" style={{ background: "var(--pastel-cyan)" }}>RULE TABLE</div>
        <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12, fontFamily: "var(--font-mono)" }}>
          <RuleLine n="1" k="review_game" v="—  no unreviewed game" />
          <RuleLine n="2" k="revisit_concept" v="—  none ≥ 24h old" />
          <RuleLine n="3" k="teach_concept" v="✓  sente_gote · sev 0.74" picked />
          <RuleLine n="4" k="serve_drill" v="—  fallback" />
        </div>
      </div>
    </div>
  );
}

function RuleLine({ n, k, v, picked }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "20px 140px 1fr",
      gap: 8, padding: "4px 6px",
      background: picked ? "var(--pastel-green)" : "transparent",
      border: picked ? "1.5px solid var(--ink)" : "1.5px solid transparent",
      borderRadius: 4,
    }}>
      <span>{n}.</span>
      <span style={{ fontWeight: picked ? 700 : 500 }}>{k}</span>
      <span style={{ color: "var(--ink-soft)" }}>{v}</span>
    </div>
  );
}

function ActionHistory() {
  const log = [
    { kind: "teach_concept",   when: "now",      reason: "ignores opponent · 0.74", c: "var(--pastel-yellow)" },
    { kind: "serve_drill",     when: "2h ago",   reason: "starter-04-twopoint-eye · ✓ solved", c: "var(--pastel-green)" },
    { kind: "review_game",     when: "yesterday",reason: "game #38 · 9×9 vs KataGo", c: "var(--pastel-cyan)" },
    { kind: "revisit_concept", when: "2d ago",   reason: "ladder · marked demonstrated", c: "var(--pastel-lavender)" },
    { kind: "serve_drill",     when: "3d ago",   reason: "starter-09-net · ✗ used hint", c: "var(--pastel-pink)" },
    { kind: "teach_concept",   when: "4d ago",   reason: "thickness vs influence", c: "var(--pastel-yellow)" },
  ];
  return (
    <div className="gs-card" style={{ padding: 18, background: "var(--bg-2)", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="gs-section-h">ACTION HISTORY · 履歴</div>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-mute)" }}>last 7 days · 12 entries</span>
      </div>
      <div style={{ marginTop: 12, overflow: "auto", display: "grid", gap: 8, position: "relative" }}>
        {/* timeline rule */}
        <div style={{ position: "absolute", left: 8, top: 4, bottom: 4, width: 2, background: "var(--ink)" }} />
        {log.map((l, i) => (
          <div key={i} style={{
            position: "relative", paddingLeft: 24,
            display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center",
          }}>
            <div style={{
              position: "absolute", left: 1, top: 14,
              width: 16, height: 16, borderRadius: 99,
              background: l.c, border: "2px solid var(--ink)",
            }} />
            <div style={{
              padding: "8px 12px", border: "2px solid var(--ink)", borderRadius: 10,
              background: l.c,
            }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>{l.kind}</div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", fontFamily: "var(--font-mono)" }}>{l.reason}</div>
            </div>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-mute)" }}>{l.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AskSensei() {
  return (
    <div className="gs-card" style={{ background: "var(--bg-2)", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
      <div style={{ padding: "14px 18px", borderBottom: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 99, border: "2.5px solid var(--ink)",
            background: "var(--ink)", color: "var(--bg-2)",
            display: "grid", placeItems: "center",
            fontFamily: "var(--font-display)", fontWeight: 700,
          }}>先</div>
          <div>
            <div className="gs-display-700" style={{ fontSize: 16 }}>Ask Sensei</div>
            <div style={{ fontSize: 11, color: "var(--ink-mute)", fontFamily: "var(--font-mono)" }}>SSE · grounded on game #38</div>
          </div>
        </div>
        <span className="gs-pill gs-pill--mint">streaming</span>
      </div>

      <div style={{ padding: 16, overflow: "auto", display: "grid", gap: 12, alignContent: "start" }}>
        <ChatBubble side="left">
          Looking at game #38, the moment around move 13 is the pivot. Want me to:
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <ChatChip>what's missing?</ChatChip>
            <ChatChip>help me read this fight</ChatChip>
            <ChatChip>what's my plan?</ChatChip>
          </div>
        </ChatBubble>

        <ChatBubble side="right">
          help me read this fight on the right side after move 13
        </ChatBubble>

        <ChatBubble side="left">
          Three things to watch:
          <ol style={{ margin: "8px 0 0 18px", padding: 0, lineHeight: 1.55 }}>
            <li>White's stone at <code style={mono}>F4</code> has 3 liberties; its weakest point is <code style={mono}>F3</code>.</li>
            <li>Your stones at <code style={mono}>G5/G7</code> are connected only via <code style={mono}>G6</code> — a hane there is sente.</li>
            <li>The capture race is <strong>4 vs 3</strong> — you win by one if you don't tenuki.</li>
          </ol>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <ChatChip primary>show variation on board</ChatChip>
            <ChatChip>follow-up: why F3?</ChatChip>
          </div>
        </ChatBubble>

        <ChatBubble side="left" typing>
          counting liberties around the corner…
        </ChatBubble>
      </div>

      <div style={{ padding: 14, borderTop: "2px solid var(--border)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <div style={{
            padding: "10px 12px",
            border: "2.5px solid var(--ink)", borderRadius: 12,
            fontSize: 13, fontFamily: "var(--font-body)", color: "var(--ink-mute)",
            background: "var(--bg)",
          }}>
            tell me what concept I should drill next…
          </div>
          <button className="gs-btn gs-btn--primary">send  ↵</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <ChatChip>what's missing?</ChatChip>
          <ChatChip>plan</ChatChip>
          <ChatChip>read fight</ChatChip>
          <ChatChip>follow up</ChatChip>
        </div>
      </div>
    </div>
  );
}

const mono = { fontFamily: "var(--font-mono)", fontSize: 12, padding: "1px 5px", background: "var(--bg)", border: "1px solid var(--ink-mute)", borderRadius: 4 };

function ChatBubble({ side, children, typing }) {
  const isLeft = side === "left";
  return (
    <div style={{
      display: "flex", justifyContent: isLeft ? "flex-start" : "flex-end",
    }}>
      <div style={{
        maxWidth: "85%",
        padding: "10px 14px",
        border: "2px solid var(--ink)",
        borderRadius: 14,
        background: isLeft ? "var(--pastel-cyan)" : "var(--pastel-pink)",
        fontSize: 13, lineHeight: 1.5,
        fontStyle: typing ? "italic" : "normal",
        opacity: typing ? 0.7 : 1,
      }}>
        {typing && <span style={{ marginRight: 6 }}>···</span>}
        {children}
      </div>
    </div>
  );
}

function ChatChip({ children, primary }) {
  return (
    <span style={{
      padding: "4px 10px",
      border: "2px solid var(--ink)", borderRadius: 999,
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 11,
      background: primary ? "var(--ink)" : "var(--bg-2)",
      color: primary ? "var(--bg-2)" : "var(--ink)",
      cursor: "pointer",
    }}>{children}</span>
  );
}

Object.assign(window, { CoachScreen });
