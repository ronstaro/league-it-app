// ──────────────────────────────────────────────────────────────────
// src/lib/knockout.js
// Single source of truth for knockout bracket slot generation.
//
// Both the preview (TBD) bracket and the final (resolved) bracket
// use buildKnockoutSlots + buildBracketFromSlots.
// Closing groups only calls resolveAbstractBracket — no reordering.
// ──────────────────────────────────────────────────────────────────

export const ORDINALS = ["1st","2nd","3rd","4th","5th","6th","7th","8th"];

// ── Internal helpers ──────────────────────────────────────────────

export function _nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

export function _bracketSeedOrder(n) {
  // Returns array of length n where result[position] = seed number (1-indexed).
  // Seed 1 and Seed 2 are on opposite halves and can only meet in the final.
  let order = [1, 2], size = 2;
  while (order.length < n) {
    size *= 2;
    const next = [];
    for (const s of order) { next.push(s); next.push(size + 1 - s); }
    order = next;
  }
  return order;
}

function _ord(rank) { return ORDINALS[rank] ?? `${rank + 1}th`; }

function _makeGroupSlot(groupName, rank) {
  return {
    id:          `slot_${groupName}_${rank}`,
    name:        `${_ord(rank)} Group ${groupName}`,
    groupName,
    rank,
    isWildcard:  false,
    isBye:       false,
    isTBD:       true,
  };
}

function _makeWildcardSlot(index, wcRankLabel) {
  return {
    id:         `slot_wc_${index}`,
    name:       `Best ${wcRankLabel} #${index + 1}`,
    groupName:  null,
    rank:       null,
    isWildcard: true,
    isBye:      false,
    isTBD:      true,
  };
}

function _makeByeSlot(key) {
  return {
    id:         `slot_bye_${key}`,
    name:       "BYE",
    groupName:  null,
    rank:       null,
    isWildcard: false,
    isBye:      true,
    isTBD:      false,
  };
}

// ── Crossover vs seeded selection ─────────────────────────────────

function _buildCrossoverSlots(groups, advancingPerGroup) {
  // Pairs consecutive groups: (A+B), (C+D), … with cross-seeding.
  // Odd last group: those players get inline BYEs.
  // Result length is always a power of 2 when this path is chosen.
  const numGroups = groups.length;
  const result    = [];

  for (let gi = 0; gi < numGroups - 1; gi += 2) {
    const gA = groups[gi], gB = groups[gi + 1];
    for (let r = 0; r < advancingPerGroup; r++) {
      const crossR = advancingPerGroup - 1 - r; // top of A vs bottom of B
      result.push(_makeGroupSlot(gA.name, r));
      result.push(_makeGroupSlot(gB.name, crossR));
    }
  }

  if (numGroups % 2 === 1) {
    const last = groups[numGroups - 1];
    for (let r = 0; r < advancingPerGroup; r++) {
      result.push(_makeGroupSlot(last.name, r));
      result.push(_makeByeSlot(`${last.name}_${r}`));
    }
  }

  return result; // length == Math.ceil(numGroups/2) * advancingPerGroup * 2
}

function _applyBracketSeed(realSlots) {
  // Place realSlots into a power-of-2 bracket using standard seed ordering.
  // Null padding slots become BYEs; top seeds (index 0, 1, …) get BYEs when
  // the count is not a clean power-of-2.
  const n      = realSlots.length;
  const size   = _nextPow2(n);
  const padded = [...realSlots, ...Array(size - n).fill(null)];
  const order  = _bracketSeedOrder(size);
  // order[i] = seed number; seed i → padded[seed-1]
  return order.map((seed, pos) => padded[seed - 1] ?? _makeByeSlot(pos));
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Build the ordered flat array of R1 slot pairs for a knockout bracket.
 *
 * orderedSlots[2i]  vs  orderedSlots[2i+1]  =  R1 match i.
 * Array length is always a power of 2.
 *
 * Decision logic:
 *  - No wildcards, ≥2 groups, AND crossover pair count is already a power of 2
 *    → use crossover pairing (A1 vs B2, A2 vs B1, …; odd last group gets BYEs)
 *  - Everything else (wildcards / single group / non-pow2 pair count)
 *    → rank-first seeded bracket; top seeds receive BYEs
 *
 * @param {Array<{name:string}>} groups
 * @param {number} advancingPerGroup
 * @param {number} wildcardCount
 * @param {string} wildcardRule      "best_3rd_place" | "none"
 * @returns {Array<object>} ordered slot objects
 */
export function buildKnockoutSlots(groups, advancingPerGroup, wildcardCount = 0, wildcardRule = "none") {
  const numGroups = groups.length;
  if (!numGroups || advancingPerGroup < 1) return [];

  const wcRankLabel   = _ord(advancingPerGroup);
  const wildcardSlots = wildcardRule === "best_3rd_place" && wildcardCount > 0
    ? Array.from({ length: wildcardCount }, (_, i) => _makeWildcardSlot(i, wcRankLabel))
    : [];

  // Use crossover when:
  //   • no wildcards
  //   • at least 2 groups
  //   • ceil(numGroups/2) * advancingPerGroup  is already a power of 2
  if (wildcardSlots.length === 0 && numGroups >= 2) {
    const crossoverPairCount = Math.ceil(numGroups / 2) * advancingPerGroup;
    if (crossoverPairCount === _nextPow2(crossoverPairCount)) {
      return _buildCrossoverSlots(groups, advancingPerGroup);
    }
  }

  // Seeded fallback: all rank-0 qualifiers first, then rank-1, …, then wildcards
  const directSlots = [];
  for (let r = 0; r < advancingPerGroup; r++) {
    for (const g of groups) directSlots.push(_makeGroupSlot(g.name, r));
  }
  return _applyBracketSeed([...directSlots, ...wildcardSlots]);
}

/**
 * Build a full bracket object from an ordered flat slot array.
 *
 * The slot array length must be a power of 2 (as produced by buildKnockoutSlots).
 * BYE slots (isBye: true) auto-advance the opposing real participant.
 *
 * @param {Array<object>} orderedSlots
 * @returns {object|null} bracket
 */
export function buildBracketFromSlots(orderedSlots) {
  if (!orderedSlots?.length) return null;
  const size = orderedSlots.length;

  const round1 = [];
  for (let i = 0; i < size; i += 2) {
    const p1       = orderedSlots[i];
    const p2       = orderedSlots[i + 1];
    const p1IsBye  = Boolean(p1?.isBye);
    const p2IsBye  = Boolean(p2?.isBye);
    const isBye    = p1IsBye !== p2IsBye;   // exactly one side is BYE
    const bothBye  = p1IsBye && p2IsBye;    // both sides are BYE (edge case)
    round1.push({
      id:       crypto.randomUUID(),
      round:    1,
      position: i / 2,
      p1:       p1IsBye ? null : p1,
      p2:       p2IsBye ? null : p2,
      winner:   isBye ? (p1IsBye ? p2 : p1) : null,
      isBye:    isBye || bothBye,
    });
  }

  const totalRounds = Math.log2(size);
  const rounds = [round1];
  for (let r = 2; r <= totalRounds; r++) {
    const prev  = rounds[r - 2];
    const count = prev.length / 2;
    rounds.push(Array.from({ length: count }, (_, i) => ({
      id:       crypto.randomUUID(),
      round:    r,
      position: i,
      p1:       prev[i * 2]?.isBye     ? prev[i * 2].winner     : null,
      p2:       prev[i * 2 + 1]?.isBye ? prev[i * 2 + 1].winner : null,
      winner:   null,
      isBye:    false,
    })));
  }

  return { rounds, seeded: true, size, generatedAt: new Date().toISOString() };
}

/**
 * Build a Map<slotId, realParticipant> from final group standings.
 * Used to resolve an abstract bracket into a real bracket.
 *
 * @param {Array}  groups
 * @param {Array}  standingsByGroup  - same order as groups; each entry is an array of standing rows
 * @param {number} advancingPerGroup
 * @param {Array}  wildcardStandings - standing rows for wildcard qualifiers, best-first
 * @param {number} wildcardCount
 * @returns {Map<string, object>}
 */
export function buildSlotResolutionMap(groups, standingsByGroup, advancingPerGroup, wildcardStandings = [], wildcardCount = 0) {
  const map = new Map();
  for (let gi = 0; gi < groups.length; gi++) {
    const g         = groups[gi];
    const standings = standingsByGroup[gi] || [];
    for (let r = 0; r < advancingPerGroup; r++) {
      const entry = standings[r];
      if (entry?.participant) map.set(`slot_${g.name}_${r}`, entry.participant);
    }
  }
  for (let i = 0; i < wildcardCount && i < wildcardStandings.length; i++) {
    const entry = wildcardStandings[i];
    if (entry?.participant) map.set(`slot_wc_${i}`, entry.participant);
  }
  return map;
}

/**
 * Replace TBD abstract slots in a bracket with real participants.
 *
 * Match IDs, slot order, and bracket structure are preserved exactly.
 * Only the participant objects inside isTBD slots are substituted.
 * BYE auto-advances in R1 are propagated to R2 after resolution.
 *
 * @param {object} abstractBracket - bracket produced by buildBracketFromSlots
 * @param {Map}    slotMap         - Map<slot.id, realParticipant>
 * @returns {object} resolved bracket (new object, abstractBracket untouched)
 */
export function resolveAbstractBracket(abstractBracket, slotMap) {
  if (!abstractBracket || !slotMap?.size) return abstractBracket;
  const b = JSON.parse(JSON.stringify(abstractBracket));

  const resolve = (p) => (p?.isTBD && slotMap.has(p.id)) ? slotMap.get(p.id) : p;

  for (const match of b.rounds[0]) {
    match.p1 = resolve(match.p1);
    match.p2 = resolve(match.p2);
    if (match.isBye) match.winner = match.p1 ?? match.p2;
  }

  // Propagate resolved BYE winners into R2
  if (b.rounds.length > 1) {
    for (let i = 0; i < b.rounds[0].length; i++) {
      const m = b.rounds[0][i];
      if (m.isBye && m.winner) {
        const nextMatch = b.rounds[1][Math.floor(i / 2)];
        if (nextMatch) {
          if (i % 2 === 0) nextMatch.p1 = m.winner;
          else             nextMatch.p2 = m.winner;
        }
      }
    }
  }

  b.generatedAt = new Date().toISOString();
  return b;
}
