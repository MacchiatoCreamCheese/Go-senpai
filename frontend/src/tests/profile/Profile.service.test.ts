import { describe, it, expect } from "vitest";
import {
  enrichMatches,
  toConceptProgress,
  buildAnalytics,
} from "../../services/profileService";

describe("Profile Service - enrichMatches", () => {
  it("enriches games with isWin based on result and player_color", () => {
    const games = [
      {
        id: "game1",
        handle: "player1",
        opponent_handle: "opponent1",
        player_color: "B",
        game_record: "(;GM[1]SZ[19])",
        kyu: -5,
        rank: "1d",
        started_at: "2024-01-15T00:00:00",
        opponent_type: "online",
        board_size: 19,
        result: "B+3.5",
      },
      {
        id: "game2",
        handle: "player1",
        opponent_handle: "opponent2",
        player_color: "W",
        game_record: "(;GM[1]SZ[19])",
        kyu: -3,
        rank: "3d",
        started_at: "2024-01-16T00:00:00",
        opponent_type: "online",
        board_size: 19,
        result: "B+5.5",
      },
    ] as any;

    const enriched = enrichMatches(games);

    expect(enriched[0].isWin).toBe(true);
    expect(enriched[1].isWin).toBe(false);
    expect(enriched[0]).toHaveProperty("endReason");
  });
});

describe("Profile Service - toConceptProgress", () => {
  it("converts concepts to progress items with progressState", () => {
    const items = [
      {
        concept_id: "c1",
        title: "Joseki",
        demonstrated: true,
        times_taught: 3,
        last_taught_at: "2024-01-15",
      },
      {
        concept_id: "c2",
        title: "Tesuji",
        demonstrated: false,
        times_taught: 1,
        last_taught_at: null,
      },
    ] as any;

    const progress = toConceptProgress(items);

    expect(progress[0].progressState).toBe("mastered");
    expect(["viewed", "practicing"]).toContain(progress[1].progressState);
    expect(progress[0].title).toBe("Joseki");
    expect(progress[0].conceptId).toBe("c1");
  });
});

describe("Profile Service - buildAnalytics", () => {
  it("returns analytics only when data has >= 2 points", () => {
    const progress = {
      games_per_week: [
        { week: "2024-W01", value: 5 },
        { week: "2024-W02", value: 3 },
      ],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;
    const concepts = [
      {
        concept_id: "c1",
        title: "Life and Death",
        demonstrated: true,
        times_taught: 5,
        last_taught_at: "2024-01-15",
      },
    ] as any;

    const analytics = buildAnalytics(progress, concepts);

    expect(analytics.gamesPerWeek).not.toBeNull();
    expect(analytics.topStudiedConcepts).toBeDefined();
  });

  it("returns null for series with < 2 points", () => {
    const progress = {
      games_per_week: [{ week: "2024-W01", value: 5 }],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;
    const concepts = [] as any;

    const analytics = buildAnalytics(progress, concepts);

    expect(analytics.gamesPerWeek).toBeNull();
    expect(analytics.drillsPerWeek).toBeNull();
  });

  it("limits topStudiedConcepts to 5 items", () => {
    const concepts = Array.from({ length: 20 }, (_, i) => ({
      concept_id: `c${i}`,
      title: `Concept ${i}`,
      demonstrated: i % 2 === 0,
      times_taught: 20 - i,
      last_taught_at: i % 3 === 0 ? "2024-01-15" : null,
    })) as any;

    const progress = {
      games_per_week: [
        { week: "2024-W01", value: 5 },
        { week: "2024-W02", value: 3 },
      ],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;

    const analytics = buildAnalytics(progress, concepts);

    expect(analytics.topStudiedConcepts.length).toBeLessThanOrEqual(5);
  });

  it("never uses fabricated analytics", () => {
    const progress = {
      games_per_week: [
        { week: "2024-W01", value: 5 },
        { week: "2024-W02", value: 3 },
      ],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;
    const concepts = [
      {
        concept_id: "c1",
        title: "Actual-Backend-Data",
        demonstrated: true,
        times_taught: 5,
        last_taught_at: "2024-01-15",
      },
    ] as any;

    const analytics = buildAnalytics(progress, concepts);

    if (analytics.topStudiedConcepts.length > 0) {
      expect(analytics.topStudiedConcepts[0].title).toBe("Actual-Backend-Data");
    }
  });
});

describe("Profile Service - toConceptProgress", () => {
  it("converts concepts to progress items with progressState", () => {
    const items = [
      {
        concept_id: "c1",
        title: "Joseki",
        demonstrated: true,
        times_taught: 3,
        last_taught_at: "2024-01-15",
      },
      {
        concept_id: "c2",
        title: "Tesuji",
        demonstrated: false,
        times_taught: 1,
        last_taught_at: null,
      },
    ] as any;

    const progress = toConceptProgress(items);

    expect(progress[0].progressState).toBe("mastered");
    expect(["viewed", "practicing"]).toContain(progress[1].progressState);
    expect(progress[0].title).toBe("Joseki");
    expect(progress[0].conceptId).toBe("c1");
  });
});

describe("Profile Service - buildAnalytics", () => {
  it("returns analytics only when data has >= 2 points", () => {
    const progress = {
      games_per_week: [
        { week: "2024-W01", value: 5 },
        { week: "2024-W02", value: 3 },
      ],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;
    const concepts = [
      {
        concept_id: "c1",
        title: "Life and Death",
        demonstrated: true,
        times_taught: 5,
        last_taught_at: "2024-01-15",
      },
    ] as any;

    const analytics = buildAnalytics(progress, concepts);

    expect(analytics.gamesPerWeek).not.toBeNull();
    expect(analytics.topStudiedConcepts).toBeDefined();
  });

  it("returns null for series with < 2 points", () => {
    const progress = {
      games_per_week: [{ week: "2024-W01", value: 5 }],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;
    const concepts = [] as any;

    const analytics = buildAnalytics(progress, concepts);

    expect(analytics.gamesPerWeek).toBeNull();
    expect(analytics.drillsPerWeek).toBeNull();
  });

  it("limits topStudiedConcepts to 5 items", () => {
    const concepts = Array.from({ length: 20 }, (_, i) => ({
      concept_id: `c${i}`,
      title: `Concept ${i}`,
      demonstrated: i % 2 === 0,
      times_taught: 20 - i,
      last_taught_at: i % 3 === 0 ? "2024-01-15" : null,
    })) as any;

    const progress = {
      games_per_week: [
        { week: "2024-W01", value: 5 },
        { week: "2024-W02", value: 3 },
      ],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;

    const analytics = buildAnalytics(progress, concepts);

    expect(analytics.topStudiedConcepts.length).toBeLessThanOrEqual(5);
  });

  it("never uses fabricated analytics", () => {
    const progress = {
      games_per_week: [
        { week: "2024-W01", value: 5 },
        { week: "2024-W02", value: 3 },
      ],
      drills_per_week: [],
      top_weakness_severity_history: [],
    } as any;
    const concepts = [
      {
        concept_id: "c1",
        title: "Actual-Backend-Data",
        demonstrated: true,
        times_taught: 5,
        last_taught_at: "2024-01-15",
      },
    ] as any;

    const analytics = buildAnalytics(progress, concepts);

    if (analytics.topStudiedConcepts.length > 0) {
      expect(analytics.topStudiedConcepts[0].title).toBe("Actual-Backend-Data");
    }
  });
});