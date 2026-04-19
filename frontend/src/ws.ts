import type { GameStateT } from "./types";

export type StateListener = (state: GameStateT) => void;

export function connectGameSocket(id: string, onState: StateListener): () => void {
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
      if (msg && msg.state) onState(msg.state as GameStateT);
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
