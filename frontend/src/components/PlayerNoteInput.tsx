import { useEffect, useRef, useState } from "react";
import { putPlayerNote } from "../api";

interface Props {
  gameId: string;
  userId: string;
  moveNumber: number;
  existingNote?: string;
  onSaved: (moveNumber: number, body: string) => void;
}

export function PlayerNoteInput({
  gameId,
  userId,
  moveNumber,
  existingNote,
  onSaved,
}: Props) {
  const [value, setValue] = useState(existingNote ?? "");
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when move number changes or an existing note loads in
  useEffect(() => {
    setValue(existingNote ?? "");
    setSaved(false);
  }, [moveNumber, existingNote]);

  async function save(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await putPlayerNote(gameId, moveNumber, userId, trimmed);
      onSaved(moveNumber, trimmed);
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 1500);
    } catch {
      // best-effort
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save(value);
    }
  }

  return (
    <div className="player-note-input">
      <label className="player-note-label">
        Your thought at move {moveNumber}
      </label>
      <div className="player-note-row">
        <textarea
          className="player-note-textarea"
          value={value}
          maxLength={300}
          placeholder="Why did you play here? (Enter to save)"
          rows={1}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          onKeyDown={handleKeyDown}
        />
        {saved && <span className="player-note-saved">✓ saved</span>}
      </div>
    </div>
  );
}
