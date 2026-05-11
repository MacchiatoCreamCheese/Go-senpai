import {
  getMyGames,
  getWeaknesses,
  getUserConcepts,
  getUserProgress,
  getDrillStats,
} from "../../api";
import type { IProfileDataSource } from "./IProfileDataSource";

export class ApiProfileDataSource implements IProfileDataSource {
  getGames(userId: string)      { return getMyGames(userId); }
  getWeaknesses(userId: string) { return getWeaknesses(userId); }
  getConcepts(userId: string)   { return getUserConcepts(userId); }
  getProgress(userId: string)   { return getUserProgress(userId); }
  getDrillStats(userId: string) { return getDrillStats(userId); }
}
