import type {
  UserGameListItem,
  UserConceptItem,
  WeaknessItem,
  UserProgressResponse,
  DrillStatsResponse,
} from "../../api";

export interface IProfileDataSource {
  getGames(userId: string): Promise<UserGameListItem[]>;
  getWeaknesses(userId: string): Promise<WeaknessItem[]>;
  getConcepts(userId: string): Promise<UserConceptItem[]>;
  getProgress(userId: string): Promise<UserProgressResponse>;
  getDrillStats(userId: string): Promise<DrillStatsResponse>;
}
