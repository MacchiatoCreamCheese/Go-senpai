import type { IProfileDataSource } from "../datasources/profile/IProfileDataSource";
import type {
  UserGameListItem,
  UserConceptItem,
  WeaknessItem,
  UserProgressResponse,
  DrillStatsResponse,
} from "../api";
import { profileDataSource } from "../datasources/profile";

export interface IProfileRepository {
  getGames(userId: string): Promise<UserGameListItem[]>;
  getWeaknesses(userId: string): Promise<WeaknessItem[]>;
  getConcepts(userId: string): Promise<UserConceptItem[]>;
  getProgress(userId: string): Promise<UserProgressResponse>;
  getDrillStats(userId: string): Promise<DrillStatsResponse>;
}

class ProfileRepository implements IProfileRepository {
  constructor(private readonly ds: IProfileDataSource) {}
  getGames(userId: string)      { return this.ds.getGames(userId); }
  getWeaknesses(userId: string) { return this.ds.getWeaknesses(userId); }
  getConcepts(userId: string)   { return this.ds.getConcepts(userId); }
  getProgress(userId: string)   { return this.ds.getProgress(userId); }
  getDrillStats(userId: string) { return this.ds.getDrillStats(userId); }
}

export const profileRepository: IProfileRepository = new ProfileRepository(profileDataSource);
