import { describe, it, expect } from "vitest";
  import {
    DEFAULT_POINT_CONFIG,
    generateRoundRobin,
    validateSchedule,
    aggregateStructuredLeaderboard,
    aggregateFlexibleLeaderboard,
    getStructuredParticipantProfile,
    getFlexibleParticipantProfile,
    reportStructuredMatchResult,
    reportFlexibleMatchResult,
  } from "./leagueMode";

  const make26 = () => Array.from({ length: 26 }, (_, i) => ({ id: i + 1 }));

  describe("DEFAULT_POINT_CONFIG", () => {
    it("has correct default values", () => {
      expect(DEFAULT_POINT_CONFIG).toEqual({ win: 3, draw: 1, loss: 0 });
    });
  });

  describe("generateRoundRobin – 26 participants", () => {
    const participants = make26();
    const rounds = generateRoundRobin(participants);
    const allMatches = rounds.flatMap((r) => r.matches);

    it("creates 25 rounds", () => {
      expect(rounds.length).toBe(25);
    });

    it("creates 325 total matches", () => {
      expect(allMatches.length).toBe(325);
    });

    it("every round has 13 matches", () => {
      rounds.forEach((round) => {
        expect(round.matches.length).toBe(13);
      });
    });

    it("no self-matches", () => {
      allMatches.forEach((m) => {
        expect(m.participantA).not.toBe(m.participantB);
      });
    });

    it("no duplicate matchups", () => {
      const seen = new Set();

      allMatches.forEach((m) => {
        const key = [m.participantA, m.participantB].sort().join("|");
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      });
    });

    it("every participant plays every other participant exactly once", () => {
      participants.forEach((p) => {
        const opponents = new Set();

        allMatches.forEach((m) => {
          if (m.participantA === p.id) opponents.add(m.participantB);
          if (m.participantB === p.id) opponents.add(m.participantA);
        });

        expect(opponents.size).toBe(25);
      });
    });

    it("no participant appears twice in the same round", () => {
      rounds.forEach((round) => {
        const ids = round.matches.flatMap((m) => [m.participantA, m.participantB]);
        expect(new Set(ids).size).toBe(ids.length);
      });
    });
  });

  describe("validateSchedule", () => {
    it("returns valid: true for a generated 26-participant schedule", () => {
      const participants = make26();
      const rounds = generateRoundRobin(participants);
      const result = validateSchedule(participants, rounds);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("aggregateStructuredLeaderboard", () => {
    const p1 = { id: 1, name: "Alice" };
    const p2 = { id: 2, name: "Bob" };

    const completed = (pA, pB, sA, sB) => ({
      participantA: pA,
      participantB: pB,
      scoreA: sA,
      scoreB: sB,
      status: "completed",
    });

    const scheduled = (pA, pB) => ({
      participantA: pA,
      participantB: pB,
      scoreA: null,
      scoreB: null,
      status: "scheduled",
    });

    const inRounds = (...matches) => [{ roundNumber: 1, matches }];

    it("ranks by points first", () => {
      const result = aggregateStructuredLeaderboard(
        [p1, p2],
        inRounds(completed(1, 2, 6, 3))
      );

      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it("ignores scheduled matches", () => {
      const result = aggregateStructuredLeaderboard(
        [p1, p2],
        inRounds(scheduled(1, 2))
      );

      expect(result[0].played).toBe(0);
      expect(result[1].played).toBe(0);
    });

    it("handles draws correctly", () => {
      const result = aggregateStructuredLeaderboard(
        [p1, p2],
        inRounds(completed(1, 2, 3, 3))
      );

      const a = result.find((p) => p.id === 1);
      const b = result.find((p) => p.id === 2);

      expect(a.draws).toBe(1);
      expect(a.points).toBe(1);
      expect(b.draws).toBe(1);
      expect(b.points).toBe(1);
    });

    it("calculates all stats correctly", () => {
      const result = aggregateStructuredLeaderboard(
        [p1, p2],
        inRounds(completed(1, 2, 6, 3))
      );

      const a = result.find((p) => p.id === 1);
      const b = result.find((p) => p.id === 2);

      expect(a.played).toBe(1);
      expect(a.wins).toBe(1);
      expect(a.draws).toBe(0);
      expect(a.losses).toBe(0);
      expect(a.points).toBe(3);
      expect(a.scoreFor).toBe(6);
      expect(a.scoreAgainst).toBe(3);
      expect(a.scoreDiff).toBe(3);
      expect(a.winPercentage).toBe(1);

      expect(b.played).toBe(1);
      expect(b.wins).toBe(0);
      expect(b.draws).toBe(0);
      expect(b.losses).toBe(1);
      expect(b.points).toBe(0);
      expect(b.scoreFor).toBe(3);
      expect(b.scoreAgainst).toBe(6);
      expect(b.scoreDiff).toBe(-3);
      expect(b.winPercentage).toBe(0);
    });
  });

  describe("aggregateFlexibleLeaderboard", () => {
    const p1 = { id: 1, name: "Alice" };
    const p2 = { id: 2, name: "Bob" };
    const p3 = { id: 3, name: "Carol" };

    const match = (pA, pB, sA, sB, status = "completed") => ({
      participantA: pA,
      participantB: pB,
      scoreA: sA,
      scoreB: sB,
      status,
    });

    it("ranks by winPercentage first", () => {
      const matches = [match(1, 2, 6, 0), match(2, 3, 6, 0)];
      const result = aggregateFlexibleLeaderboard([p1, p2, p3], matches);

      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      expect(result[2].id).toBe(3);
    });

    it("uses wins as tie breaker when winPercentage is equal", () => {
      const matches = [
        match(1, 3, 6, 0),
        match(2, 3, 6, 0),
        match(2, 3, 6, 0),
      ];

      const result = aggregateFlexibleLeaderboard([p1, p2, p3], matches);
      const p1entry = result.find((p) => p.id === 1);
      const p2entry = result.find((p) => p.id === 2);

      expect(p1entry.winPercentage).toBe(1);
      expect(p2entry.winPercentage).toBe(1);
      expect(result.indexOf(p2entry)).toBeLessThan(result.indexOf(p1entry));
    });

    it("uses scoreDiff as tie breaker when winPercentage and wins are equal", () => {
      const matches = [
        match(1, 2, 6, 1),
        match(2, 1, 6, 5),
      ];

      const result = aggregateFlexibleLeaderboard([p1, p2], matches);

      expect(result[0].id).toBe(1);
      expect(result[0].scoreDiff).toBe(4);
      expect(result[1].id).toBe(2);
      expect(result[1].scoreDiff).toBe(-4);
    });

    it("ignores scheduled matches", () => {
      const matches = [match(1, 2, null, null, "scheduled")];
      const result = aggregateFlexibleLeaderboard([p1, p2], matches);

      expect(result[0].played).toBe(0);
      expect(result[1].played).toBe(0);
    });

    it("handles draws correctly", () => {
      const matches = [match(1, 2, 3, 3)];
      const result = aggregateFlexibleLeaderboard([p1, p2], matches);

      const a = result.find((p) => p.id === 1);
      const b = result.find((p) => p.id === 2);

      expect(a.draws).toBe(1);
      expect(a.points).toBe(1);
      expect(b.draws).toBe(1);
      expect(b.points).toBe(1);
    });

    it("uses name alphabetically as final fallback", () => {
      const result = aggregateFlexibleLeaderboard([p2, p1], []);

      expect(result[0].name).toBe("Alice");
      expect(result[1].name).toBe("Bob");
    });
  });

  describe("getStructuredParticipantProfile", () => {
    const p1 = { id: 1, name: "Alice" };
    const p2 = { id: 2, name: "Bob" };
    const p3 = { id: 3, name: "Carol" };

    const leaderboard = [
      {
        id: 2,
        name: "Bob",
        played: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        points: 3,
        scoreFor: 6,
        scoreAgainst: 3,
        scoreDiff: 3,
        winPercentage: 1,
      },
      {
        id: 1,
        name: "Alice",
        played: 1,
        wins: 0,
        draws: 0,
        losses: 1,
        points: 0,
        scoreFor: 3,
        scoreAgainst: 6,
        scoreDiff: -3,
        winPercentage: 0,
      },
      {
        id: 3,
        name: "Carol",
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDiff: 0,
        winPercentage: 0,
      },
    ];

    const rounds = [
      {
        roundNumber: 1,
        matches: [
          {
            id: "r1m1",
            participantA: 1,
            participantB: 2,
            scoreA: 3,
            scoreB: 6,
            status: "completed",
          },
          {
            id: "r1m2",
            participantA: 2,
            participantB: 3,
            scoreA: null,
            scoreB: null,
            status: "scheduled",
          },
        ],
      },
      {
        roundNumber: 2,
        matches: [
          {
            id: "r2m1",
            participantA: 1,
            participantB: 3,
            scoreA: null,
            scoreB: null,
            status: "scheduled",
          },
        ],
      },
    ];

    it("returns null when selectedParticipantId is not found", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 999, rounds, leaderboard);

      expect(result).toBeNull();
    });

    it("returns participant id and name", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 1, rounds, leaderboard);

      expect(result.id).toBe(1);
      expect(result.name).toBe("Alice");
    });

    it("returns the correct 1-based rank", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 1, rounds, leaderboard);

      expect(result.rank).toBe(2);
    });

    it("returns stats from the leaderboard entry", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 1, rounds, leaderboard);

      expect(result.stats).toEqual(leaderboard[1]);
    });

    it("includes only completed matches involving the selected participant", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 1, rounds, leaderboard);

      expect(result.completedMatches).toHaveLength(1);
      expect(result.completedMatches[0].id).toBe("r1m1");
      expect(result.completedMatches[0].status).toBe("completed");
    });

    it("includes only scheduled/upcoming matches involving the selected participant", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 1, rounds, leaderboard);

      expect(result.upcomingMatches).toHaveLength(1);
      expect(result.upcomingMatches[0].id).toBe("r2m1");
      expect(result.upcomingMatches[0].status).toBe("scheduled");
    });

    it("excludes unrelated matches", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 1, rounds, leaderboard);
      const allReturnedIds = [
        ...result.completedMatches,
        ...result.upcomingMatches,
      ].map((m) => m.id);

      expect(allReturnedIds).not.toContain("r1m2");
    });

    it("preserves/includes roundNumber on returned matches", () => {
      const result = getStructuredParticipantProfile([p1, p2, p3], 1, rounds, leaderboard);

      expect(result.completedMatches[0].roundNumber).toBe(1);
      expect(result.upcomingMatches[0].roundNumber).toBe(2);
    });
  });

  describe("getFlexibleParticipantProfile", () => {
    const p1 = { id: 1, name: "Alice" };
    const p2 = { id: 2, name: "Bob" };
    const p3 = { id: 3, name: "Carol" };

    const leaderboard = [
      {
        id: 2,
        name: "Bob",
        played: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        points: 3,
        scoreFor: 6,
        scoreAgainst: 3,
        scoreDiff: 3,
        winPercentage: 1,
      },
      {
        id: 1,
        name: "Alice",
        played: 1,
        wins: 0,
        draws: 0,
        losses: 1,
        points: 0,
        scoreFor: 3,
        scoreAgainst: 6,
        scoreDiff: -3,
        winPercentage: 0,
      },
      {
        id: 3,
        name: "Carol",
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDiff: 0,
        winPercentage: 0,
      },
    ];

    const matches = [
      {
        id: "m1",
        participantA: 1,
        participantB: 2,
        scoreA: 3,
        scoreB: 6,
        status: "completed",
      },
      {
        id: "m2",
        participantA: 2,
        participantB: 3,
        scoreA: null,
        scoreB: null,
        status: "scheduled",
      },
      {
        id: "m3",
        participantA: 1,
        participantB: 3,
        scoreA: null,
        scoreB: null,
        status: "scheduled",
      },
    ];

    it("returns null when selectedParticipantId is not found", () => {
      const result = getFlexibleParticipantProfile([p1, p2, p3], 999, matches, leaderboard);

      expect(result).toBeNull();
    });

    it("returns participant id and name", () => {
      const result = getFlexibleParticipantProfile([p1, p2, p3], 1, matches, leaderboard);

      expect(result.id).toBe(1);
      expect(result.name).toBe("Alice");
    });

    it("returns the correct 1-based rank", () => {
      const result = getFlexibleParticipantProfile([p1, p2, p3], 1, matches, leaderboard);

      expect(result.rank).toBe(2);
    });

    it("returns stats from the leaderboard entry", () => {
      const result = getFlexibleParticipantProfile([p1, p2, p3], 1, matches, leaderboard);

      expect(result.stats).toEqual(leaderboard[1]);
    });

    it("includes only completed matches involving the selected participant", () => {
      const result = getFlexibleParticipantProfile([p1, p2, p3], 1, matches, leaderboard);

      expect(result.completedMatches).toHaveLength(1);
      expect(result.completedMatches[0].id).toBe("m1");
      expect(result.completedMatches[0].status).toBe("completed");
    });

    it("includes only scheduled/upcoming matches involving the selected participant", () => {
      const result = getFlexibleParticipantProfile([p1, p2, p3], 1, matches, leaderboard);

      expect(result.upcomingMatches).toHaveLength(1);
      expect(result.upcomingMatches[0].id).toBe("m3");
      expect(result.upcomingMatches[0].status).toBe("scheduled");
    });

    it("excludes unrelated matches", () => {
      const result = getFlexibleParticipantProfile([p1, p2, p3], 1, matches, leaderboard);
      const allReturnedIds = [
        ...result.completedMatches,
        ...result.upcomingMatches,
      ].map((m) => m.id);

      expect(allReturnedIds).not.toContain("m2");
    });
  });

  describe("reportStructuredMatchResult", () => {
    const rounds = [
      {
        roundNumber: 1,
        matches: [
          {
            id: "r1m1",
            participantA: 1,
            participantB: 2,
            scoreA: null,
            scoreB: null,
            status: "scheduled",
          },
          {
            id: "r1m2",
            participantA: 2,
            participantB: 3,
            scoreA: null,
            scoreB: null,
            status: "scheduled",
          },
          {
            id: "r1m3",
            participantA: 1,
            participantB: 3,
            scoreA: 6,
            scoreB: 3,
            status: "completed",
          },
        ],
      },
    ];

    it("returns error when scores are empty", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 1, "", "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must not be empty");
      expect(result.data).toBeNull();
    });

    it("returns error when scores are not numbers", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 1, "abc", "def");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must be numbers");
    });

    it("returns error when scores are negative", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 1, -1, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must be zero or greater");
    });

    it("returns error when scores are not whole numbers", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 1, 6.5, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must be whole numbers");
    });

    it("returns error when matchId is not found", () => {
      const result = reportStructuredMatchResult(rounds, "nonexistent", 1, 6, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Match not found");
    });

    it("returns error when selected participant is not part of the match", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 3, 6, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Selected participant is not part of this match");
    });

    it("returns error when match is already completed", () => {
      const result = reportStructuredMatchResult(rounds, "r1m3", 1, 6, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Match is already completed");
    });

    it("updates scoreA/scoreB correctly when selected participant is participantA", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 1, 6, 3);

      expect(result.success).toBe(true);
      const updated = result.data[0].matches.find((m) => m.id === "r1m1");
      expect(updated.scoreA).toBe(6);
      expect(updated.scoreB).toBe(3);
    });

    it("updates scoreA/scoreB correctly when selected participant is participantB", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 2, 6, 3);

      expect(result.success).toBe(true);
      const updated = result.data[0].matches.find((m) => m.id === "r1m1");
      expect(updated.scoreA).toBe(3);
      expect(updated.scoreB).toBe(6);
    });

    it("marks the match as completed", () => {
      const result = reportStructuredMatchResult(rounds, "r1m1", 1, 6, 3);

      expect(result.success).toBe(true);
      const updated = result.data[0].matches.find((m) => m.id === "r1m1");
      expect(updated.status).toBe("completed");
    });

    it("does not mutate the original rounds", () => {
      reportStructuredMatchResult(rounds, "r1m1", 1, 6, 3);

      expect(rounds[0].matches[0].status).toBe("scheduled");
      expect(rounds[0].matches[0].scoreA).toBeNull();
      expect(rounds[0].matches[0].scoreB).toBeNull();
    });
  });

  describe("reportFlexibleMatchResult", () => {
    it("returns error for self-match", () => {
      const result = reportFlexibleMatchResult([], 1, 1, 6, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("A participant cannot play against themselves");
    });

    it("returns error when scores are empty", () => {
      const result = reportFlexibleMatchResult([], 1, 2, "", "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must not be empty");
    });

    it("returns error when scores are not numbers", () => {
      const result = reportFlexibleMatchResult([], 1, 2, "abc", "def");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must be numbers");
    });

    it("returns error when scores are negative", () => {
      const result = reportFlexibleMatchResult([], 1, 2, -1, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must be zero or greater");
    });

    it("returns error when scores are not whole numbers", () => {
      const result = reportFlexibleMatchResult([], 1, 2, 6.5, 3);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scores must be whole numbers");
    });

    it("creates a completed match", () => {
      const result = reportFlexibleMatchResult([], 1, 2, 6, 3);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe("completed");
    });

    it("maps selected participant score to scoreA", () => {
      const result = reportFlexibleMatchResult([], 1, 2, 6, 3);

      expect(result.success).toBe(true);
      expect(result.data[0].participantA).toBe(1);
      expect(result.data[0].scoreA).toBe(6);
      expect(result.data[0].participantB).toBe(2);
      expect(result.data[0].scoreB).toBe(3);
    });

    it("appends the match to the existing matches", () => {
      const existing = [
        { id: "flex-1", participantA: 1, participantB: 2, scoreA: 6, scoreB: 3, status: "completed" },
      ];
      const result = reportFlexibleMatchResult(existing, 1, 3, 4, 2);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe("flex-1");
      expect(result.data[1].participantA).toBe(1);
      expect(result.data[1].participantB).toBe(3);
    });

    it("does not mutate the original matches", () => {
      const existing = [
        { id: "flex-1", participantA: 1, participantB: 2, scoreA: 6, scoreB: 3, status: "completed" },
      ];
      reportFlexibleMatchResult(existing, 1, 3, 4, 2);

      expect(existing).toHaveLength(1);
    });

    it("creates deterministic id flex-${matches.length + 1}", () => {
      const existing = [
        { id: "flex-1", participantA: 1, participantB: 2, scoreA: 6, scoreB: 3, status: "completed" },
      ];
      const result = reportFlexibleMatchResult(existing, 1, 3, 4, 2);

      expect(result.data[1].id).toBe("flex-2");
    });
  });
