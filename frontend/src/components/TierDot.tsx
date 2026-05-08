import type { MoveFeature } from "../api";

// Mirrors backend TIER_THRESHOLDS in features.py
const THRESHOLDS: Record<number, [number, number]> = {
  9:  [0.8, 2.0],
  13: [1.0, 3.0],
  19: [1.5, 5.0],
};

export function getTier(
  pointsLost: number | null,
  boardSize: number,
): "green" | "yellow" | "red" {
  if (pointsLost == null) return "green";
  const [yMin, rMin] = THRESHOLDS[boardSize] ?? [1.5, 5.0];
  if (pointsLost >= rMin) return "red";
  if (pointsLost >= yMin) return "yellow";
  return "green";
}

interface Props {
  feature: MoveFeature;
  boardSize: number;
  onClick?: () => void;
}

export function TierDot({ feature, boardSize, onClick }: Props) {
  const tier = getTier(feature.points_lost, boardSize);
  const clickable = tier !== "green" && !!onClick;
  return (
    <span
      className={`tier-dot tier-dot--${tier}${clickable ? " tier-dot--clickable" : ""}`}
      aria-label={`${tier} move`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick?.();
            }
          : undefined
      }
    />
  );
}
