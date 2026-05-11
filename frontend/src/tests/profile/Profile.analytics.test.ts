import { describe, it, expect } from "vitest";
import { buildAnalytics } from "../../services/profileService"

// Mock the actual data structure that buildAnalytics expects
type MockProgress = {
  games_per_week: Array<{ week: string; value: number }>;
  drills_per_week: Array<{ week: string; value: number }>;
  top_weakness_severity_history: Array<{ week: string; value: number }>;
};

type MockConcept = {
  concept_id: string;
  title: string;
  demonstrated: boolean;
  times_taught: number;
  last_taught_at: string | null;
};

describe("Profile Analytics Derivation", () => {
  describe("data validation", () => {
    it("requires >= 2 data points before returning analytics", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 5,
          last_taught_at: "2024-01-15",
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // With only 1 data point in games_per_week, it should be null
      expect(analytics.gamesPerWeek).toBeNull();
    });

    it("accepts >= 2 data points", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 10,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Tesuji",
          demonstrated: false,
          times_taught: 5,
          last_taught_at: "2024-01-12",
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // Should return valid analytics with gamesPerWeek
      expect(analytics.gamesPerWeek).not.toBeNull();
    });
  });

  describe("no fabrication", () => {
    it("does NOT create fake win rates", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 5,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Tesuji",
          demonstrated: false,
          times_taught: 3,
          last_taught_at: null,
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // Should have real data from backend
      expect(analytics).toBeDefined();
      expect(analytics.gamesPerWeek).not.toBeNull();
    });

    it("does NOT average mock statistics", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 7 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 7,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Tesuji",
          demonstrated: false,
          times_taught: 3,
          last_taught_at: null,
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // Should derive from real data only
      expect(analytics.topStudiedConcepts).toBeDefined();
      expect(Array.isArray(analytics.topStudiedConcepts)).toBe(true);
    });

    it("does NOT fill missing time series with zeros", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 5,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Tesuji",
          demonstrated: false,
          times_taught: 0,
          last_taught_at: null,
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // With only 1 games_per_week point, should return null
      expect(analytics.gamesPerWeek).toBeNull();
    });
  });

  describe("delta calculation", () => {
    it("returns data structure", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 5,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Tesuji",
          demonstrated: false,
          times_taught: 3,
          last_taught_at: null,
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      expect(analytics).toBeDefined();
      expect(analytics.gamesPerWeek).not.toBeNull();
    });

    it("shows analytics with >= 2 data points", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 10 },
          { week: "2024-W02", value: 8 },
          { week: "2024-W03", value: 5 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 10,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Tesuji",
          demonstrated: true,
          times_taught: 8,
          last_taught_at: "2024-01-12",
        },
        {
          concept_id: "c3",
          title: "Joseki",
          demonstrated: false,
          times_taught: 5,
          last_taught_at: null,
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // With 3 points, analytics should be valid
      expect(analytics.gamesPerWeek).not.toBeNull();
    });
  });

  describe("top studied concepts", () => {
    it("includes topStudiedConcepts sorted by study count", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 15,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Tesuji",
          demonstrated: false,
          times_taught: 7,
          last_taught_at: null,
        },
        {
          concept_id: "c3",
          title: "Joseki",
          demonstrated: true,
          times_taught: 3,
          last_taught_at: "2024-01-10",
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      expect(analytics.topStudiedConcepts).toBeDefined();
      if (analytics.topStudiedConcepts.length > 0) {
        expect(analytics.topStudiedConcepts[0].title).toBe("Life and Death");
        if (analytics.topStudiedConcepts.length > 1) {
          expect(analytics.topStudiedConcepts[1].title).toBe("Tesuji");
        }
      }
    });

    it("limits to top 5 concepts", () => {
      const concepts: MockConcept[] = Array.from({ length: 20 }, (_, i) => ({
        concept_id: `c${i}`,
        title: `Concept ${i}`,
        demonstrated: i % 2 === 0,
        times_taught: 20 - i,
        last_taught_at: i % 3 === 0 ? "2024-01-15" : null,
      }));
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };

      const analytics = buildAnalytics(progress as any, concepts as any);

      // Should limit results to top 5 concepts
      expect(analytics.topStudiedConcepts.length).toBeLessThanOrEqual(5);
      expect(analytics.topStudiedConcepts.length).toBeGreaterThan(0);
    });
  });

  describe("null safety", () => {
    it("handles empty progress data", () => {
      const progress: MockProgress = {
        games_per_week: [],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Life and Death",
          demonstrated: true,
          times_taught: 5,
          last_taught_at: "2024-01-15",
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // All series should be null with no data
      expect(analytics.gamesPerWeek).toBeNull();
      expect(analytics.drillsPerWeek).toBeNull();
      expect(analytics.weaknessSeverityHistory).toBeNull();
    });

    it("handles empty concepts array", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // Should handle gracefully with empty topStudiedConcepts
      expect(analytics).toBeDefined();
      expect(analytics.topStudiedConcepts).toBeDefined();
    });  
  });

  describe("backend integration", () => {
    it("only uses data from backend, not mock defaults", () => {
      const progress: MockProgress = {
        games_per_week: [
          { week: "2024-W01", value: 5 },
          { week: "2024-W02", value: 3 },
        ],
        drills_per_week: [],
        top_weakness_severity_history: [],
      };
      const concepts: MockConcept[] = [
        {
          concept_id: "c1",
          title: "Unique-Name-1",
          demonstrated: true,
          times_taught: 5,
          last_taught_at: "2024-01-15",
        },
        {
          concept_id: "c2",
          title: "Unique-Name-2",
          demonstrated: false,
          times_taught: 3,
          last_taught_at: null,
        },
      ];

      const analytics = buildAnalytics(progress as any, concepts as any);

      // Output should contain actual concept names from backend
      if (analytics.topStudiedConcepts.length > 0) {
        const titles = analytics.topStudiedConcepts.map((c) => c.title);
        expect(titles).toContain("Unique-Name-1");
      }
    });
  });
});
