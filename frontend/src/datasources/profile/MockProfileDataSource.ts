import type {
  UserGameListItem,
  UserConceptItem,
  WeaknessItem,
  UserProgressResponse,
  DrillStatsResponse,
} from "../../api";
import type { IProfileDataSource } from "./IProfileDataSource";
import { hashCode } from "../../data/mockProfile";

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

const BOARD_SIZES = [9, 13, 19] as const;
const RESULTS = ["B+R", "W+R", "B+5.5", "W+3.5", "B+12.5", "W+2.5", null];
const MOCK_HANDLES = [
  "TakahashiGo", "stonecutter", "joseki_jun", "yuki_dan", "kato_ryusei",
  "hoshi_player", "weiqi_fan", "amateurgame",
];

const CONCEPT_SEEDS: Array<{ concept_id: string; title: string }> = [
  { concept_id: "ladder",         title: "Ladder" },
  { concept_id: "net",            title: "Net (Geta)" },
  { concept_id: "empty_triangle", title: "Empty Triangle" },
  { concept_id: "snapback",       title: "Snapback" },
  { concept_id: "ko",             title: "Ko" },
  { concept_id: "life_and_death", title: "Life and Death" },
  { concept_id: "tesuji",         title: "Tesuji" },
  { concept_id: "good_shape",     title: "Good Shape" },
];

const WEAKNESS_THEMES = [
  "Reading ahead",
  "Life and Death",
  "Joseki",
  "Ko Fights",
];

function isoAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function mockWeeklySeries(base: number, variance: number, seed: string) {
  const count = 10;
  const now = new Date();
  const h = hashCode(seed);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (count - 1 - i) * 7);
    const year = d.getFullYear();
    const week = Math.ceil(
      ((d.getTime() - new Date(year, 0, 1).getTime()) / 86_400_000 + 1) / 7,
    );
    const noise = (Math.sin(i * 7.3 + base + h) + 1) * variance;
    return {
      week: `${year}-W${String(week).padStart(2, "0")}`,
      value: Math.max(0, base + noise),
    };
  });
}

export class MockProfileDataSource implements IProfileDataSource {
  async getGames(userId: string): Promise<UserGameListItem[]> {
    await delay(350);
    const h = hashCode(userId);
    const count = 8 + (h % 7);
    return Array.from({ length: count }, (_, i) => {
      const hi = hashCode(`${userId}_g${i}`);
      const playerColor: "B" | "W" = hi % 2 === 0 ? "B" : "W";
      const opponentType: "human" | "ai" = hi % 3 === 0 ? "human" : "ai";
      return {
        id: `mock_${userId.slice(0, 6)}_${i}`,
        board_size: BOARD_SIZES[hi % BOARD_SIZES.length],
        result: RESULTS[hi % RESULTS.length],
        started_at: isoAgo(i * 8 + (hi % 5)),
        player_color: playerColor,
        opponent_type: opponentType,
        opponent_handle: opponentType === "ai"
          ? "Sensei AI"
          : MOCK_HANDLES[hi % MOCK_HANDLES.length],
      };
    });
  }

  async getWeaknesses(userId: string): Promise<WeaknessItem[]> {
    await delay(250);
    return WEAKNESS_THEMES.map((theme, i) => {
      const hi = hashCode(`${userId}_w${i}`);
      return {
        theme,
        severity: parseFloat((0.3 + (hi % 50) / 100).toFixed(2)),
        evidence_count: 2 + (hi % 7),
        last_seen_at: isoAgo(5 + (hi % 20)),
        latest_insight: null,
      };
    });
  }

  async getConcepts(userId: string): Promise<UserConceptItem[]> {
    await delay(300);
    const h = hashCode(userId);
    const count = 4 + (h % 5);
    return CONCEPT_SEEDS.slice(0, count).map((c, i) => {
      const hi = hashCode(`${userId}_c${i}`);
      return {
        concept_id: c.concept_id,
        title: c.title,
        times_taught: 1 + (hi % 5),
        last_taught_at: isoAgo(3 + (hi % 30)),
        demonstrated: hi % 3 === 0,
      };
    });
  }

  async getProgress(userId: string): Promise<UserProgressResponse> {
    await delay(400);
    return {
      games_per_week:                mockWeeklySeries(2.5, 1.8, userId),
      drills_per_week:               mockWeeklySeries(4.0, 2.2, userId + "d"),
      top_weakness_severity_history: mockWeeklySeries(0.55, 0.15, userId + "w"),
    };
  }

  async getDrillStats(userId: string): Promise<DrillStatsResponse> {
    await delay(200);
    const h = hashCode(userId);
    const total = 10 + (h % 40);
    const correct = Math.floor(total * (0.5 + (h % 30) / 100));
    return { total_attempts: total, accuracy: correct / total };
  }
}
