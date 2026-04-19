import { useEffect, useState } from "react";

import { fetchGame, playMove, sgfUrl } from "./api";
import { GoBoard } from "./GoBoard";
import { connectGameSocket } from "./ws";
import type { ColorCode, GameT, GameStateT, MoveKind, PointT } from "./types";

interface Props {
  gameId: string;
  onExit: () => void;
}

const STORAGE_KEY = (id: string) => `gosenpai:role:${id}`;

export function GameView({ gameId, onExit }: Props) {
  const [game, setGame] = useState<GameT | null>(null);
  const [state, setState] = useState<GameStateT | null>(null);
  const [role, setRole] = useState<ColorCode>(
    () => (localStorage.getItem(STORAGE_KEY(gameId)) as ColorCode) || "B",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGame(gameId)
      .then((g) => {
        if (cancelled) return;
        setGame(g);
        setState(g.state);
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    const close = connectGameSocket(gameId, (s) => setState(s));
    return close;
  }, [gameId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY(gameId), role);
  }, [gameId, role]);

  async function send(kind: MoveKind, point: PointT | null) {
    setError(null);
    try {
      const next = await playMove(gameId, role, kind, point);
      setState(next);
    } catch (e) {
      setError(String(e));
    }
  }

  if (error && !state) {
    return (
      <div style={{ padding: 24 }}>
        <p>Error: {error}</p>
        <button onClick={onExit}>Back to lobby</button>
      </div>
    );
  }
  if (!game || !state) return <div style={{ padding: 24 }}>Loading game {gameId}…</div>;

  const disabled = state.status !== "active" || state.turn !== role;

  return (
    <div style={{ padding: 24, display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div>
        <GoBoard
          state={state}
          disabled={disabled}
          onPlay={(p) => send("play", p)}
        />
      </div>
      <div style={{ minWidth: 240 }}>
        <h2 style={{ marginTop: 0 }}>Game {gameId}</h2>
        <p>
          <strong>Size:</strong> {game.size}×{game.size} &nbsp;
          <strong>Komi:</strong> {game.komi}
        </p>
        <p>
          <label>
            Play as{" "}
            <select value={role} onChange={(e) => setRole(e.target.value as ColorCode)}>
              <option value="B">Black</option>
              <option value="W">White</option>
            </select>
          </label>
        </p>
        <p>
          <strong>Turn:</strong> {state.turn === "B" ? "Black" : "White"}
          {disabled && state.status === "active" ? " (waiting)" : ""}
        </p>
        <p>
          <strong>Captures:</strong> Black {state.captures.B} · White {state.captures.W}
        </p>
        {state.status === "active" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => send("pass", null)} disabled={state.turn !== role}>
              Pass
            </button>
            <button onClick={() => send("resign", null)} disabled={state.turn !== role}>
              Resign
            </button>
          </div>
        ) : (
          <div style={{ padding: 12, background: "#eef", borderRadius: 4 }}>
            <strong>Game over:</strong> {state.result ?? state.status}
          </div>
        )}
        <p style={{ marginTop: 16 }}>
          <a href={sgfUrl(gameId)} download>
            Export SGF
          </a>
        </p>
        <p>
          <button onClick={onExit}>Back to lobby</button>
        </p>
        {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
      </div>
    </div>
  );
}
