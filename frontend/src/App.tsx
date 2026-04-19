import { useEffect, useState } from "react";

import { createGame } from "./api";
import { GameView } from "./GameView";

function readHash(): string | null {
  const m = window.location.hash.match(/^#\/game\/([^/]+)$/);
  return m ? m[1] : null;
}

export function App() {
  const [gameId, setGameId] = useState<string | null>(() => readHash());
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setGameId(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function go(id: string) {
    window.location.hash = `#/game/${id}`;
    setGameId(id);
  }

  function exit() {
    window.location.hash = "";
    setGameId(null);
  }

  async function create(size: 9 | 13 | 19) {
    setError(null);
    try {
      const game = await createGame(size);
      go(game.id);
    } catch (e) {
      setError(String(e));
    }
  }

  if (gameId) return <GameView gameId={gameId} onExit={exit} />;

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1>Go-senpai</h1>
      <p>Barebones Go — two tabs can open a game and play it to completion.</p>
      <section style={{ marginTop: 24 }}>
        <h2>Create a new game</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => create(9)}>9×9</button>
          <button onClick={() => create(13)}>13×13</button>
          <button onClick={() => create(19)}>19×19</button>
        </div>
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>Join an existing game</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (joinInput.trim()) go(joinInput.trim());
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="game id"
            style={{ flex: 1, padding: 4 }}
          />
          <button type="submit">Join</button>
        </form>
      </section>
      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
    </div>
  );
}
