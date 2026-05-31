export const DEFAULT_POINT_CONFIG = { win: 3, draw: 1, loss: 0 };

export function generateRoundRobin(participants) {
  const n = participants.length;
  if (n < 2) return [];

  let roster = participants.map((p) => p.id);

  if (n % 2 !== 0) {
    roster.push(null);
  }

  const half = roster.length / 2;
  const totalRounds = roster.length - 1;
  const rounds = [];

  for (let r = 0; r < totalRounds; r++) {
    const matches = [];

    for (let i = 0; i < half; i++) {
      const a = roster[i];
      const b = roster[roster.length - 1 - i];

      if (a !== null && b !== null) {
        matches.push({
          id: `r${r + 1}m${i + 1}`,
          roundNumber: r + 1,
          participantA: a,
          participantB: b,
          scoreA: null,
          scoreB: null,
          status: "scheduled",
        });
      }
    }

    rounds.push({
      roundNumber: r + 1,
      matches,
    });

    const last = roster.pop();
    roster.splice(1, 0, last);
  }

  return rounds;
}

export function validateSchedule(participants, rounds) {
  const n = participants.length;
  const errors = [];
  const allMatches = rounds.flatMap((round) => round.matches);

  const expectedTotal = (n * (n - 1)) / 2;

  if (allMatches.length !== expectedTotal) {
    errors.push(`Expected ${expectedTotal} total matches, got ${allMatches.length}`);
  }

  for (const match of allMatches) {
    if (match.participantA === match.participantB) {
      errors.push(`Self-match detected for participant ${match.participantA}`);
    }
  }

  const seenMatchups = new Set();

  for (const match of allMatches) {
    const matchupKey = [match.participantA, match.participantB].sort().join("|");

    if (seenMatchups.has(matchupKey)) {
      errors.push(`Duplicate matchup: ${matchupKey}`);
    } else {
      seenMatchups.add(matchupKey);
    }
  }

  for (const round of rounds) {
    const participantsInRound = round.matches.flatMap((match) => [
      match.participantA,
      match.participantB,
    ]);

    if (new Set(participantsInRound).size !== participantsInRound.length) {
      errors.push(`Round ${round.roundNumber}: a participant appears more than once`);
    }
  }

  for (const participant of participants) {
    const opponents = new Set();

    for (const match of allMatches) {
      if (match.participantA === participant.id) {
        opponents.add(match.participantB);
      }

      if (match.participantB === participant.id) {
        opponents.add(match.participantA);
      }
    }

    if (opponents.size !== n - 1) {
      errors.push(
        `Participant ${participant.id} plays ${opponents.size} opponents, expected ${n - 1}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function buildLeaderboard(participants, matches, pointConfig) {
  const statsMap = {};

  for (const p of participants) {
    statsMap[p.id] = {
      id: p.id,
      name: p.name ?? String(p.id),
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
    };
  }

  for (const match of matches) {
    if (match.status !== "completed") continue;

    const a = statsMap[match.participantA];
    const b = statsMap[match.participantB];

    if (!a || !b) continue;

    a.played += 1;
    b.played += 1;

    a.scoreFor += match.scoreA;
    a.scoreAgainst += match.scoreB;

    b.scoreFor += match.scoreB;
    b.scoreAgainst += match.scoreA;

    if (match.scoreA > match.scoreB) {
      a.wins += 1;
      a.points += pointConfig.win;

      b.losses += 1;
      b.points += pointConfig.loss;
    } else if (match.scoreB > match.scoreA) {
      b.wins += 1;
      b.points += pointConfig.win;

      a.losses += 1;
      a.points += pointConfig.loss;
    } else {
      a.draws += 1;
      a.points += pointConfig.draw;

      b.draws += 1;
      b.points += pointConfig.draw;
    }
  }

  return Object.values(statsMap).map((stats) => ({
    ...stats,
    scoreDiff: stats.scoreFor - stats.scoreAgainst,
    winPercentage: stats.played > 0 ? stats.wins / stats.played : 0,
  }));
}

export function aggregateStructuredLeaderboard(
  participants,
  rounds,
  pointConfig = DEFAULT_POINT_CONFIG
) {
  const allMatches = rounds.flatMap((round) => round.matches);

  return buildLeaderboard(participants, allMatches, pointConfig).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.played !== a.played) return b.played - a.played;

    return a.name.localeCompare(b.name);
  });
}

export function aggregateFlexibleLeaderboard(
  participants,
  matches,
  pointConfig = DEFAULT_POINT_CONFIG
) {
  return buildLeaderboard(participants, matches, pointConfig).sort((a, b) => {
    if (b.winPercentage !== a.winPercentage) return b.winPercentage - a.winPercentage;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.scoreDiff !== a.scoreDiff) return b.scoreDiff - a.scoreDiff;
    if (b.played !== a.played) return b.played - a.played;
    if (b.points !== a.points) return b.points - a.points;

    return a.name.localeCompare(b.name);
  });
}

function buildProfile(participant, allMatches, leaderboard) {
  const rank = leaderboard.findIndex((p) => p.id === participant.id) + 1;
  const stats = leaderboard.find((p) => p.id === participant.id) ?? null;

  const involvedMatches = allMatches.filter(
    (match) =>
      match.participantA === participant.id || match.participantB === participant.id
  );

  return {
    id: participant.id,
    name: participant.name,
    rank: rank > 0 ? rank : null,
    stats,
    completedMatches: involvedMatches.filter((match) => match.status === "completed"),
    upcomingMatches: involvedMatches.filter((match) => match.status === "scheduled"),
  };
}

export function getStructuredParticipantProfile(
  participants,
  selectedParticipantId,
  rounds,
  leaderboard
) {
  const participant = participants.find((p) => p.id === selectedParticipantId);

  if (!participant) {
    return null;
  }

  const allMatches = rounds.flatMap((round) =>
    round.matches.map((match) => ({
      ...match,
      roundNumber: round.roundNumber,
    }))
  );

  return buildProfile(participant, allMatches, leaderboard);
}

export function getFlexibleParticipantProfile(
  participants,
  selectedParticipantId,
  matches,
  leaderboard
) {
  const participant = participants.find((p) => p.id === selectedParticipantId);

  if (!participant) {
    return null;
  }

  return buildProfile(participant, matches, leaderboard);
}

function validateScores(a, b) {
  if (a === "" || a === null || a === undefined || b === "" || b === null || b === undefined) {
    return { valid: false, error: "Scores must not be empty" };
  }

  const sA = Number(a);
  const sB = Number(b);

  if (Number.isNaN(sA) || Number.isNaN(sB)) {
    return { valid: false, error: "Scores must be numbers" };
  }

  if (sA < 0 || sB < 0) {
    return { valid: false, error: "Scores must be zero or greater" };
  }

  if (!Number.isInteger(sA) || !Number.isInteger(sB)) {
    return { valid: false, error: "Scores must be whole numbers" };
  }

  return {
    valid: true,
    error: null,
    scoreA: sA,
    scoreB: sB,
  };
}

export function reportStructuredMatchResult(
  rounds,
  matchId,
  selectedParticipantId,
  selectedParticipantScore,
  opponentScore
) {
  const validation = validateScores(selectedParticipantScore, opponentScore);

  if (!validation.valid) {
    return {
      success: false,
      data: null,
      error: validation.error,
    };
  }

  let foundRoundIndex = -1;
  let foundMatchIndex = -1;

  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex++) {
    const matchIndex = rounds[roundIndex].matches.findIndex(
      (match) => match.id === matchId
    );

    if (matchIndex !== -1) {
      foundRoundIndex = roundIndex;
      foundMatchIndex = matchIndex;
      break;
    }
  }

  if (foundRoundIndex === -1) {
    return {
      success: false,
      data: null,
      error: "Match not found",
    };
  }

  const match = rounds[foundRoundIndex].matches[foundMatchIndex];

  if (match.status === "completed") {
    return {
      success: false,
      data: null,
      error: "Match is already completed",
    };
  }

  if (
    match.participantA !== selectedParticipantId &&
    match.participantB !== selectedParticipantId
  ) {
    return {
      success: false,
      data: null,
      error: "Selected participant is not part of this match",
    };
  }

  const isParticipantA = match.participantA === selectedParticipantId;
  const scoreA = isParticipantA ? validation.scoreA : validation.scoreB;
  const scoreB = isParticipantA ? validation.scoreB : validation.scoreA;

  const updatedRounds = rounds.map((round, roundIndex) => {
    if (roundIndex !== foundRoundIndex) {
      return round;
    }

    return {
      ...round,
      matches: round.matches.map((currentMatch, matchIndex) => {
        if (matchIndex !== foundMatchIndex) {
          return currentMatch;
        }

        return {
          ...currentMatch,
          scoreA,
          scoreB,
          status: "completed",
        };
      }),
    };
  });

  return {
    success: true,
    data: updatedRounds,
    error: null,
  };
}

export function reportFlexibleMatchResult(
  matches,
  selectedParticipantId,
  opponentParticipantId,
  selectedParticipantScore,
  opponentScore
) {
  if (selectedParticipantId === opponentParticipantId) {
    return {
      success: false,
      data: null,
      error: "A participant cannot play against themselves",
    };
  }

  const validation = validateScores(selectedParticipantScore, opponentScore);

  if (!validation.valid) {
    return {
      success: false,
      data: null,
      error: validation.error,
    };
  }

  const newMatch = {
    id: `flex-${matches.length + 1}`,
    participantA: selectedParticipantId,
    participantB: opponentParticipantId,
    scoreA: validation.scoreA,
    scoreB: validation.scoreB,
    status: "completed",
  };

  return {
    success: true,
    data: [...matches, newMatch],
    error: null,
  };
}