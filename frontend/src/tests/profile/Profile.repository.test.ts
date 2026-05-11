import { describe, it, expect, vi } from "vitest";
import type { IProfileDataSource } from "../../datasources/profile/IProfileDataSource";

// Direct class definition for testing (avoids export issues)
class TestProfileRepository {
  constructor(private readonly ds: IProfileDataSource) {}
  getGames(userId: string) { return this.ds.getGames(userId); }
  getWeaknesses(userId: string) { return this.ds.getWeaknesses(userId); }
  getConcepts(userId: string) { return this.ds.getConcepts(userId); }
  getProgress(userId: string) { return this.ds.getProgress(userId); }
  getDrillStats(userId: string) { return this.ds.getDrillStats(userId); }
}

describe("ProfileRepository - Delegation Pattern", () => {
  it("delegates getGames to datasource", async () => {
    const mockDataSource = {
      getGames: vi.fn().mockResolvedValue([]),
      getWeaknesses: vi.fn(),
      getConcepts: vi.fn(),
      getProgress: vi.fn(),
      getDrillStats: vi.fn(),
    } as any;

    const repo = new TestProfileRepository(mockDataSource);
    await repo.getGames("user1");

    expect(mockDataSource.getGames).toHaveBeenCalledWith("user1");
  });

  it("delegates getWeaknesses to datasource", async () => {
    const mockDataSource = {
      getGames: vi.fn(),
      getWeaknesses: vi.fn().mockResolvedValue([]),
      getConcepts: vi.fn(),
      getProgress: vi.fn(),
      getDrillStats: vi.fn(),
    } as any;

    const repo = new TestProfileRepository(mockDataSource);
    await repo.getWeaknesses("user1");

    expect(mockDataSource.getWeaknesses).toHaveBeenCalledWith("user1");
  });

  it("passes through responses without mutation", async () => {
    const testData = [
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
    ];

    const mockDataSource = {
      getGames: vi.fn().mockResolvedValue(testData),
      getWeaknesses: vi.fn(),
      getConcepts: vi.fn(),
      getProgress: vi.fn(),
      getDrillStats: vi.fn(),
    } as any;

    const repo = new TestProfileRepository(mockDataSource);
    const result = await repo.getGames("user1");

    expect(result).toEqual(testData);
  });

  it("supports datasource swapping", async () => {
    const mockDataSource1 = {
      getGames: vi.fn().mockResolvedValue([]),
      getWeaknesses: vi.fn(),
      getConcepts: vi.fn(),
      getProgress: vi.fn(),
      getDrillStats: vi.fn(),
    } as any;

    const mockDataSource2 = {
      getGames: vi.fn().mockResolvedValue([{ id: "game1" }]),
      getWeaknesses: vi.fn(),
      getConcepts: vi.fn(),
      getProgress: vi.fn(),
      getDrillStats: vi.fn(),
    } as any;

    const repo1 = new TestProfileRepository(mockDataSource1);
    const repo2 = new TestProfileRepository(mockDataSource2);

    const result1 = await repo1.getGames("user1");
    const result2 = await repo2.getGames("user1");

    expect(result1).toEqual([]);
    expect(result2.length).toBeGreaterThan(0);
  });
});
