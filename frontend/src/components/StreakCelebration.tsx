import { useEffect } from "react";

const popKeyframe = `
  @keyframes streak-pop {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.85); }
    to   { opacity: 1; transform: translate(-50%, -50%) scale(1);    }
  }
`;

export function StreakCelebration({ count, onClose }: { count: number; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <>
      <style>{popKeyframe}</style>
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 300,
        animation: "streak-pop 250ms ease forwards",
        background: "var(--pastel-peach)",
        border: "3px solid var(--ink)",
        borderRadius: 18,
        boxShadow: "var(--shadow-block)",
        padding: "32px 36px",
        width: 280,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        textAlign: "center",
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close streak celebration"
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            color: "var(--ink-soft)",
            padding: "2px 6px",
          }}
        >
          ×
        </button>

        {/* Flame icon */}
        <svg width="60" height="72" viewBox="0 0 60 72" fill="none" aria-hidden>
          <defs>
            <linearGradient id="sc-flame" x1="30" y1="65" x2="30" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="#E85D04" />
              <stop offset="55%"  stopColor="#F48C06" />
              <stop offset="100%" stopColor="#FAD643" />
            </linearGradient>
          </defs>
          <path
            d="M30 2C30 2 46 18 46 34C46 44 39.5 52 30 52C20.5 52 14 44 14 34C14 25 21 17 21 17C21 17 19 29 26 34C26 34 23 23 30 2Z"
            fill="url(#sc-flame)"
          />
          <path
            d="M30 18C30 18 38 26 38 36C38 41 34.4 45 30 45C25.6 45 22 41 22 36C22 31 25 27 25 27C25 27 24 33 28 36C28 36 26 29 30 18Z"
            fill="#FAD643"
            opacity="0.75"
          />
          <circle cx="30" cy="62" r="9"    fill="var(--ink)" />
          <circle cx="26.5" cy="59" r="2.5" fill="white" opacity="0.35" />
        </svg>

        {/* Achievement text */}
        <div className="gs-display-700" style={{ fontSize: 28, lineHeight: 1.1 }}>
          {count} Day Streak!
        </div>
      </div>
    </>
  );
}
