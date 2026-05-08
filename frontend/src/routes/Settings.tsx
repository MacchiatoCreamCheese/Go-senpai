import { useQueryClient } from "@tanstack/react-query";

import { useSettings, type BoardTheme, type StoneStyle, type BoardSize } from "../lib/settings";
import { GoBoard } from "../GoBoard";
import type { Cell } from "../lib/replay";

const THEMES: Array<{ id: BoardTheme; label: string; blurb: string }> = [
  { id: "wood", label: "Wood", blurb: "The default warm tatami feel." },
  { id: "slate", label: "Slate", blurb: "Cooler, library-like contrast." },
  { id: "minimal", label: "Minimal", blurb: "Hairline grid, no woodgrain." },
];

const STONE_STYLES: Array<{ id: StoneStyle; label: string }> = [
  { id: "classic", label: "Classic (3D)" },
  { id: "flat", label: "Flat" },
];

const SIZES: BoardSize[] = [9, 13, 19];

// Tiny preview position for the live board sample.
function previewBoard(size: number): Cell[][] {
  const b: Cell[][] = Array.from({ length: size }, () => Array<Cell>(size).fill(0));
  const c = Math.floor(size / 2);
  b[c - 1][c - 1] = 1;
  b[c - 1][c] = 2;
  b[c][c - 1] = 2;
  b[c][c] = 1;
  return b;
}

export default function Settings() {
  const [settings, setSettings] = useSettings();
  const queryClient = useQueryClient();

  function resetLocalState() {
    if (!confirm("Clear all local data (settings, cached queries, sign-in shortcuts)? You'll stay signed in.")) {
      return;
    }
    // Preserve the Supabase session so the user doesn't get bounced to /login.
    const preserved: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-")) preserved[key] = localStorage.getItem(key) ?? "";
    }
    localStorage.clear();
    for (const [k, v] of Object.entries(preserved)) localStorage.setItem(k, v);
    queryClient.clear();
    window.location.assign("/");
  }

  return (
    <div className="settings-page">
      <header className="settings-head">
        <span className="home-eyebrow">Preferences</span>
        <h1 className="settings-title">Settings</h1>
        <p className="dim">
          All settings are stored on this device only. Multi-device sync arrives later.
        </p>
      </header>

      <div className="settings-grid">
        <section className="settings-col">
          <h3 className="settings-section">Board</h3>

          <Field label="Theme">
            <div className="settings-radio-row">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={"settings-chip" + (settings.boardTheme === t.id ? " is-on" : "")}
                  onClick={() => setSettings({ boardTheme: t.id })}
                  title={t.blurb}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Stone style">
            <div className="settings-radio-row">
              {STONE_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={"settings-chip" + (settings.stoneStyle === s.id ? " is-on" : "")}
                  onClick={() => setSettings({ stoneStyle: s.id })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Show coordinates">
            <Toggle
              on={settings.showCoordinates}
              onChange={(v) => setSettings({ showCoordinates: v })}
            />
          </Field>

          <Field label="Default board size">
            <select
              className="styled-select"
              value={settings.defaultBoardSize}
              onChange={(e) => setSettings({ defaultBoardSize: Number(e.target.value) as BoardSize })}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>{s}×{s}</option>
              ))}
            </select>
          </Field>
        </section>

        <section className="settings-col">
          <h3 className="settings-section">Experience</h3>

          <Field label="Sound effects">
            <Toggle on={settings.soundOn} onChange={(v) => setSettings({ soundOn: v })} />
          </Field>

          <Field label="Animations">
            <Toggle on={settings.animationsOn} onChange={(v) => setSettings({ animationsOn: v })} />
          </Field>

          <p className="dim" style={{ fontStyle: "italic", fontSize: "0.85rem", marginTop: 16 }}>
            Sound and stone-style toggles will take effect once the asset pipeline lands —
            today they're stored but not yet applied.
          </p>
        </section>

        <section className="settings-col settings-preview-col">
          <h3 className="settings-section">Preview</h3>
          <div className="settings-preview">
            <GoBoard
              board={previewBoard(9)}
              vertexSize={26}
              disabled
            />
          </div>
        </section>
      </div>

      <section className="settings-maintenance">
        <h3 className="settings-section">Maintenance</h3>
        <div className="settings-maintenance-row">
          <div>
            <strong style={{ display: "block", marginBottom: 4 }}>Reset local state</strong>
            <p className="dim" style={{ fontStyle: "italic", fontSize: "0.85rem", margin: 0, maxWidth: 480 }}>
              Wipes preferences, cached server data, and any stale identity from previous sessions.
              Your Supabase sign-in is preserved.
            </p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={resetLocalState}>
            Reset
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="settings-field">
      <label className="settings-field-label">{label}</label>
      <div className="settings-field-body">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={"settings-toggle" + (on ? " is-on" : "")}
      onClick={() => onChange(!on)}
    >
      <span className="settings-toggle-knob" />
    </button>
  );
}
