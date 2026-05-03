// parseMG("6–3") → {w:6,l:3}  — winner gets +6 games, loser gets +3
export const parseMG = s => {
  const [a,b] = (s||"").split(/[–-]/);
  return { w:parseInt(a)||0, l:parseInt(b)||0 };
};

export const countGames = (sets, side) =>
  (sets||[]).reduce((acc,s) => { const {w,l}=parseMG(s); return acc+(side==="w"?w:l); }, 0);

// Tally gamesWon/gamesLost from the live feed for every player
export const enrichPlayers = (players, feed) => {
  const gW={}, gL={};
  players.forEach(p => { gW[p.id]=0; gL[p.id]=0; });
  feed.forEach(m => {
    // Winner scores "w" side, but also loses "l" side games
    (m.winnerIds||[]).forEach(id => {
      gW[id]=(gW[id]||0)+countGames(m.sets,"w");
      gL[id]=(gL[id]||0)+countGames(m.sets,"l");
    });
    // Loser scores "l" side, but also loses "w" side games
    (m.loserIds||[]).forEach(id => {
      gW[id]=(gW[id]||0)+countGames(m.sets,"l");
      gL[id]=(gL[id]||0)+countGames(m.sets,"w");
    });
  });
  return players.map(p => ({ ...p, gamesWon:gW[p.id]||0, gamesLost:gL[p.id]||0 }));
};

// Derive ALL player stats (wins/losses/streak/clutchWins/etc.) from match history.
// This is the source of truth — no need to write computed stats back to the DB.
export const derivePlayerStats = (players, feed) => {
  const map = {};
  players.forEach(p => { map[p.id] = { wins:0, losses:0, streak:0, bestStreak:0, clutchWins:0, gamesWon:0, gamesLost:0, comebacks:0 }; });
  const chronological = [...feed].reverse(); // oldest→newest so streak accumulates correctly
  chronological.forEach(m => {
    const isClutch = (m.sets||[]).some(s => { const {w,l}=parseMG(s); return w>6||(Math.min(w,l)>=5&&w-l===2); });
    (m.winnerIds||[]).forEach(id => {
      if (!map[id]) return;
      map[id].wins++;
      map[id].gamesWon  += countGames(m.sets, "w");
      map[id].gamesLost += countGames(m.sets, "l"); // mini-games the winner conceded
      if (isClutch) map[id].clutchWins++;
      if (m.isComeback) map[id].comebacks++;
      map[id].streak = map[id].streak >= 0 ? map[id].streak + 1 : 1;
      map[id].bestStreak = Math.max(map[id].bestStreak, map[id].streak);
    });
    (m.loserIds||[]).forEach(id => {
      if (!map[id]) return;
      map[id].losses++;
      map[id].gamesWon  += countGames(m.sets, "l"); // mini-games the loser scored
      map[id].gamesLost += countGames(m.sets, "w");
      map[id].streak = map[id].streak <= 0 ? map[id].streak - 1 : -1;
    });
  });
  return players.map(p => ({
    ...p,
    wins:        map[p.id]?.wins        || 0,
    losses:      map[p.id]?.losses      || 0,
    streak:      map[p.id]?.streak      || 0,
    bestStreak:  map[p.id]?.bestStreak  || 0,
    clutchWins:  map[p.id]?.clutchWins  || 0,
    comebacks:   map[p.id]?.comebacks   || 0,
    totalPlayed: (map[p.id]?.wins||0) + (map[p.id]?.losses||0),
    gamesWon:    map[p.id]?.gamesWon    || 0,
    gamesLost:   map[p.id]?.gamesLost   || 0,
  }));
};

export const byWins = ps => [...ps].sort((a,b) => b.wins-a.wins || a.losses-b.losses);
export const medal  = r => r===1?{e:"🥇",c:"#FFD700"}:r===2?{e:"🥈",c:"#C0C0C0"}:r===3?{e:"🥉",c:"#CD7F32"}:null;
