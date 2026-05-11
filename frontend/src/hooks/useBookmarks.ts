import { useState, useCallback } from "react";

const STORAGE_KEY = "senpai_concept_bookmarks";

function loadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function persistIds(ids: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function useBookmarks() {
  const [ids, setIds] = useState<Set<string>>(loadIds);

  const toggle = useCallback((id: string) => {
    setIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      persistIds(next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, toggle, isBookmarked };
}
