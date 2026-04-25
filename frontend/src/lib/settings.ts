import { useEffect, useState } from "react";

export type BoardTheme = "wood" | "slate" | "minimal";
export type StoneStyle = "classic" | "flat";
export type BoardSize = 9 | 13 | 19;

export interface Settings {
  boardTheme: BoardTheme;
  stoneStyle: StoneStyle;
  showCoordinates: boolean;
  soundOn: boolean;
  animationsOn: boolean;
  defaultBoardSize: BoardSize;
}

const KEY = "senpai_settings";

const DEFAULTS: Settings = {
  boardTheme: "wood",
  stoneStyle: "classic",
  showCoordinates: true,
  soundOn: false,
  animationsOn: true,
  defaultBoardSize: 9,
};

function read(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

const listeners = new Set<(s: Settings) => void>();
let current = read();

function applyThemeToBody(theme: BoardTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.boardTheme = theme;
}

// Apply on first load.
applyThemeToBody(current.boardTheme);

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  if (patch.boardTheme) applyThemeToBody(patch.boardTheme);
  for (const fn of listeners) fn(current);
}

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [state, setState] = useState<Settings>(current);
  useEffect(() => {
    listeners.add(setState);
    return () => { listeners.delete(setState); };
  }, []);
  return [state, setSettings];
}
