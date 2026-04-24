import type { ColorCode, GameT, GameStateT, MoveKind, PointT } from "./types";
export type { ColorCode } from "./types";

async function asJson<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(detail || `${resp.status} ${resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

export interface UserT {
  id: string;
  handle: string;
}

export async function createUser(handle: string): Promise<UserT> {
  const resp = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  });
  return asJson<UserT>(resp);
}

export async function createGame(
  size: 9 | 13 | 19,
  userId: string,
  color: ColorCode,
): Promise<GameT> {
  const resp = await fetch("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size, user_id: userId, color }),
  });
  return asJson<GameT>(resp);
}

export async function swapColors(id: string): Promise<GameT> {
  const resp = await fetch(`/api/games/${id}/swap_colors`, { method: "POST" });
  return asJson<GameT>(resp);
}

export async function fetchGame(id: string): Promise<GameT> {
  return asJson<GameT>(await fetch(`/api/games/${id}`));
}

export async function joinGame(id: string, userId: string): Promise<GameT> {
  const resp = await fetch(`/api/games/${id}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  return asJson<GameT>(resp);
}

export async function playMove(
  id: string,
  color: ColorCode,
  kind: MoveKind,
  point: PointT | null,
): Promise<GameStateT> {
  const resp = await fetch(`/api/games/${id}/moves`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color, kind, point }),
  });
  return asJson<GameStateT>(resp);
}

export function sgfUrl(id: string): string {
  return `/api/games/${id}/sgf`;
}
