import type { UserGameListItem } from "../api";

/** Label inside the small opponent pill on game list rows (lobby, home, games). */
export function gameOpponentPillText(
  g: Pick<UserGameListItem, "opponent_type" | "opponent_handle">,
): string {
  if (g.opponent_type === "ai") return "vs AI";
  if (g.opponent_handle) return `vs ${g.opponent_handle}`;
  return "waiting for opponent";
}

/** `gs-pill--*` modifier for {@link gameOpponentPillText} rows. */
export function gameOpponentPillClass(
  g: Pick<UserGameListItem, "opponent_type" | "opponent_handle">,
): string {
  if (g.opponent_type === "ai") return "gs-pill--red";
  if (!g.opponent_handle) return "gs-pill--yellow";
  return "gs-pill--lav";
}
