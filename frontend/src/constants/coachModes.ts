/** Sensei coach preset modes — ids must match `/api/games/.../coach/invoke` `mode` field. */
export const COACH_PRESET_MODES = [
  { id: "whats_missing", label: "What am I missing?" },
  { id: "help_read_fight", label: "Help me read this fight" },
  { id: "whats_my_plan", label: "What's my plan?" },
] as const;

export type CoachPresetModeId = (typeof COACH_PRESET_MODES)[number]["id"];

const LABEL_BY_ID: Record<CoachPresetModeId, string> = Object.fromEntries(
  COACH_PRESET_MODES.map((m) => [m.id, m.label]),
) as Record<CoachPresetModeId, string>;

/** Display text for a preset `mode` when there is no free-text `user_input`. */
export function coachPresetLabel(mode: string): string | undefined {
  return LABEL_BY_ID[mode as CoachPresetModeId];
}
