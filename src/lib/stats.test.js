import { describe, it, expect } from "vitest";
import { parseMG, countGames, derivePlayerStats } from "./stats";

describe("parseMG", () => {
  it("parses hyphen-minus score", () => {
    expect(parseMG("6-3")).toEqual({ w: 6, l: 3 });
  });

  it("parses en-dash score", () => {
    expect(parseMG("7–5")).toEqual({ w: 7, l: 5 });
  });
});

describe("countGames", () => {
  const sets = ["6-3", "6-4"];

  it("sums winner-side games", () => {
    expect(countGames(sets, "w")).toBe(12);
  });

  it("sums loser-side games", () => {
    expect(countGames(sets, "l")).toBe(7);
  });
});

describe("derivePlayerStats", () => {
  it("normal 1v1 match", () => {
    const players = [{ id: 1 }, { id: 2 }];
    const feed = [{ winnerIds: [1], loserIds: [2], sets: ["6-3", "6-4"] }];
    const result = derivePlayerStats(players, feed);
    const p1 = result.find(p => p.id === 1);
    const p2 = result.find(p => p.id === 2);

    expect(p1.wins).toBe(1);
    expect(p1.losses).toBe(0);
    expect(p1.streak).toBe(1);
    expect(p1.gamesWon).toBe(12);
    expect(p1.gamesLost).toBe(7);

    expect(p2.wins).toBe(0);
    expect(p2.losses).toBe(1);
    expect(p2.streak).toBe(-1);
    expect(p2.gamesWon).toBe(7);
    expect(p2.gamesLost).toBe(12);
  });

  it("doubles match (2v2)", () => {
    const players = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const feed = [{ winnerIds: [1, 2], loserIds: [3, 4], sets: ["6-3"] }];
    const result = derivePlayerStats(players, feed);

    [1, 2].forEach(id => {
      const p = result.find(p => p.id === id);
      expect(p.wins).toBe(1);
      expect(p.losses).toBe(0);
      expect(p.gamesWon).toBe(6);
      expect(p.gamesLost).toBe(3);
    });

    [3, 4].forEach(id => {
      const p = result.find(p => p.id === id);
      expect(p.wins).toBe(0);
      expect(p.losses).toBe(1);
      expect(p.gamesWon).toBe(3);
      expect(p.gamesLost).toBe(6);
    });
  });

  it("records comeback win for winner", () => {
    const players = [{ id: 1 }, { id: 2 }];
    const feed = [{ winnerIds: [1], loserIds: [2], sets: ["6-3"], isComeback: true }];
    const result = derivePlayerStats(players, feed);
    expect(result.find(p => p.id === 1).comebacks).toBe(1);
    expect(result.find(p => p.id === 2).comebacks).toBe(0);
  });

  it("records clutch win for winner (7-5 set)", () => {
    const players = [{ id: 1 }, { id: 2 }];
    // 7-5: min(7,5)=5 >= 5 and 7-5 = 2 → clutch
    const feed = [{ winnerIds: [1], loserIds: [2], sets: ["7-5"] }];
    const result = derivePlayerStats(players, feed);
    expect(result.find(p => p.id === 1).clutchWins).toBe(1);
    expect(result.find(p => p.id === 2).clutchWins).toBe(0);
  });

  it("player with no matches has zeroed stats", () => {
    const players = [{ id: 1 }];
    const result = derivePlayerStats(players, []);
    const p = result[0];
    expect(p.wins).toBe(0);
    expect(p.losses).toBe(0);
    expect(p.streak).toBe(0);
    expect(p.gamesWon).toBe(0);
    expect(p.gamesLost).toBe(0);
    expect(p.clutchWins).toBe(0);
    expect(p.comebacks).toBe(0);
    expect(p.totalPlayed).toBe(0);
  });
});
