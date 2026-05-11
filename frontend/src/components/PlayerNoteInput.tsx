import { useEffect, useId, useRef, useState } from "react";
import { putPlayerNote } from "../api";

interface Props {
  gameId: string;
  userId: string;
  moveNumber: number;
  existingNote?: string;
  onSaved: (moveNumber: number, body: string) => void;
  onAfterSave?: () => void;
}

export function PlayerNoteInput({
  gameId,
  userId,
  moveNumber,
  existingNote,
  onSaved,
  onAfterSave,
}: Props) {
  const fieldId = useId();
  const [value, setValue] = useState(existingNote ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when move number changes or an existing note loads in
  useEffect(() => {
    setValue(existingNote ?? "");
    setSaved(false);
  }, [moveNumber, existingNote]);

  async function save(text: string) {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await putPlayerNote(gameId, moveNumber, userId, trimmed);
      onSaved(moveNumber, trimmed);
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 1800);
      onAfterSave?.();
    } catch {
      // best-effort
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void save(value);
    }
  }

  const canSave = value.trim().length > 0 && !saving;

  return (
    <div className="play-player-note">
      <div className="play-player-note-head">
        <span className="gs-tag" style={{ background: "var(--pastel-lavender)" }}>STRATEGY NOTE</span>
        <span className="play-player-note-move">move {moveNumber}</span>
      </div>
      <label htmlFor={fieldId} className="visually-hidden">
        Your thought at move {moveNumber}
      </label>
      <p className="play-player-note-hint">
        Why this move? Saved notes give Sensei context when you switch to the Sensei tab.
      </p>
      <textarea
        id={fieldId}
        className="play-player-note-field"
        value={value}
        maxLength={300}
        placeholder="Short reflection… (Enter to save, Shift+Enter for newline)"
        rows={2}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onKeyDown={handleKeyDown}
      />
      <div className="play-player-note-toolbar">
        <span className="play-player-note-meta">{value.length}/300</span>
        <div className="play-player-note-actions">
          {saved && (
            <span className="gs-pill gs-pill--mint" style={{ fontSize: 10, padding: "3px 8px" }}>
              ✓ saved
            </span>
          )}
          <button
            type="button"
            className="gs-btn gs-btn--primary"
            style={{ padding: "5px 12px", fontSize: 11, fontFamily: "var(--font-display)", fontWeight: 600 }}
            disabled={!canSave}
            onClick={() => void save(value)}
          >
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}
