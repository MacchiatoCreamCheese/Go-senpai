import "@testing-library/jest-dom";
import { afterEach, beforeAll, afterAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// Default mock responses for all profile endpoints
export const mockProfileHandlers = [
  http.get("/api/games", () =>
    HttpResponse.json([
      {
        id: "game1",
        handle: "test-player",
        opponent_handle: "opponent1",
        player_color: "black",
        game_record: "(;GM[1]SZ[19])",
        kyu: -5,
        rank: "1d",
        date: "2024-01-15",
        result: "win",
        private_notes: "Good game",
      },
      {
        id: "game2",
        handle: "test-player",
        opponent_handle: "opponent2",
        player_color: "white",
        game_record: "(;GM[1]SZ[19])",
        kyu: -3,
        rank: "3d",
        date: "2024-01-16",
        result: "loss",
        private_notes: "",
      },
    ])
  ),
  http.get("/api/weaknesses", () =>
    HttpResponse.json([
      {
        id: "weakness1",
        concept: "Life and Death",
        frequency: 5,
        created_at: "2024-01-10",
      },
      {
        id: "weakness2",
        concept: "Tactical Reading",
        frequency: 3,
        created_at: "2024-01-12",
      },
    ])
  ),
  http.get("/api/concepts", () =>
    HttpResponse.json([
      {
        id: "concept1",
        name: "Life and Death",
        demonstrated: true,
      },
      {
        id: "concept2",
        name: "Tactical Reading",
        demonstrated: false,
      },
      {
        id: "concept3",
        name: "Joseki",
        demonstrated: true,
      },
    ])
  ),
  http.get("/api/progress", () =>
    HttpResponse.json([
      {
        concept_id: "concept1",
        action_type: "review",
        count: 8,
      },
      {
        concept_id: "concept2",
        action_type: "review",
        count: 3,
      },
    ])
  ),
  http.get("/api/drill_stats", () =>
    HttpResponse.json({
      totalAttempts: 45,
      accuracy: 0.7,
    })
  ),
];

// Setup MSW server for all tests
export const server = setupServer(...mockProfileHandlers);

beforeAll(() => {
  // Suppress console errors during tests (optional, remove if you want to see them)
  // vi.spyOn(console, 'error').mockImplementation(() => {});
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
