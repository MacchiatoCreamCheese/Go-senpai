import { useEffect, useRef, useState } from "react";

interface Props {
  current: number;        // 0..total
  total: number;
  onChange: (n: number) => void;
  /** Milliseconds between auto-advance ticks while playing. */
  intervalMs?: number;
}

export function MoveScrubber({ current, total, onChange, intervalMs = 700 }: Props) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keyboard nav: ←/→ step, Home/End jump.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      if (tgt && /input|textarea|select/i.test(tgt.tagName)) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); onChange(Math.max(0, current - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onChange(Math.min(total, current + 1)); }
      else if (e.key === "Home") { e.preventDefault(); onChange(0); }
      else if (e.key === "End") { e.preventDefault(); onChange(total); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, total, onChange]);

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      onChange(Math.min(total, current + 1));
    }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, current, total, intervalMs, onChange]);

  // Stop at end
  useEffect(() => {
    if (current >= total) setPlaying(false);
  }, [current, total]);

  return (
    <div className="scrubber">
      <div className="scrubber-row">
        <div className="scrubber-cluster scrubber-cluster--end">
          <button className="scrubber-btn" title="First (Home)" onClick={() => onChange(0)} disabled={current === 0}>⏮</button>
          <button className="scrubber-btn" title="Back (←)" onClick={() => onChange(Math.max(0, current - 1))} disabled={current === 0}>◀</button>
        </div>
        <button
          className="scrubber-btn scrubber-btn-play"
          title={playing ? "Pause (Space)" : "Play (Space)"}
          onClick={() => setPlaying((p) => !p)}
          disabled={current >= total}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="scrubber-cluster scrubber-cluster--start">
          <button className="scrubber-btn" title="Forward (→)" onClick={() => onChange(Math.min(total, current + 1))} disabled={current >= total}>▶</button>
          <button className="scrubber-btn" title="Last (End)" onClick={() => onChange(total)} disabled={current >= total}>⏭</button>
          <span className="scrubber-counter">
            <strong>{current}</strong>
            <span className="scrubber-counter-sep">/</span>
            <span>{total}</span>
          </span>
        </div>
      </div>
      <input
        type="range"
        className="scrubber-range"
        min={0}
        max={total}
        step={1}
        value={current}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        aria-label="Move scrubber"
      />
    </div>
  );
}
