import type { GameStateT } from "./types";

export type StateListener = (state: GameStateT) => void;
export type PlayersListener = (players: {
  black_user_id: string | null;
  white_user_id: string | null;
}) => void;
export type TierListener = (e: {
  move_number: number;
  tier: "green" | "yellow" | "red";
}) => void;

export interface ChatMessage {
  user_id: string;
  message: string;
  timestamp: string;
}
export type ChatListener = (msg: ChatMessage) => void;

export interface GameSocketHandle {
  disconnect: () => void;
  sendChat: (userId: string, message: string) => void;
}

export function connectGameSocket(
  id: string,
  onState: StateListener,
  onPlayers?: PlayersListener,
  onTier?: TierListener,
  onChat?: ChatListener,
): GameSocketHandle {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${window.location.host}/ws/games/${id}`;
  const socket = new WebSocket(url);
  let cancelled = false;

  socket.addEventListener("open", () => {
    if (cancelled) socket.close(1000, "cancelled");
  });
  socket.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (!msg) return;
      if (msg.event === "players" && onPlayers) {
        onPlayers({
          black_user_id: msg.black_user_id ?? null,
          white_user_id: msg.white_user_id ?? null,
        });
      } else if (msg.event === "move_tier" && onTier) {
        onTier({ move_number: msg.move_number, tier: msg.tier });
      } else if (msg.event === "chat" && onChat) {
        onChat({ user_id: msg.user_id, message: msg.message, timestamp: msg.timestamp });
      } else if (msg.state) {
        onState(msg.state as GameStateT);
      }
    } catch {
      /* ignore malformed frames */
    }
  });

  function disconnect() {
    cancelled = true;
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000, "cancelled");
    }
  }

  function sendChat(userId: string, message: string) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event: "chat", user_id: userId, message }));
    }
  }

  return { disconnect, sendChat };
}
