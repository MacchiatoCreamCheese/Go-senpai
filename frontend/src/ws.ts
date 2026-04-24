import type { GameStateT } from "./types";

export type StateListener = (state: GameStateT) => void;
export type PlayersListener = (players: {
  black_user_id: string | null;
  white_user_id: string | null;
}) => void;

export function connectGameSocket(
  id: string,
  onState: StateListener,
  onPlayers?: PlayersListener,
): () => void {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${window.location.host}/ws/games/${id}`;
  const socket = new WebSocket(url);
  let cancelled = false;

  socket.addEventListener("open", () => {
    // If React StrictMode (or a fast route change) cancelled us before the
    // handshake finished, close cleanly now that we're OPEN.
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
      } else if (msg.state) {
        onState(msg.state as GameStateT);
      }
    } catch {
      /* ignore malformed frames */
    }
  });

  return () => {
    cancelled = true;
    if (socket.readyState === WebSocket.OPEN) {
      socket.close(1000, "cancelled");
    }
    // CONNECTING: the 'open' handler above will close it.
    // CLOSING / CLOSED: nothing to do.
  };
}
