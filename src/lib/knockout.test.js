import { describe, it, expect } from "vitest";
import {
  buildKnockoutSlots,
  buildBracketFromSlots,
  buildSlotResolutionMap,
  resolveAbstractBracket,
  _nextPow2,
  _bracketSeedOrder,
} from "./knockout.js";

// ── helpers ──────────────────────────────────────────────────────

function makeGroups(count) {
  return Array.from({ length: count }, (_, i) => ({ name: String.fromCharCode(65 + i) }));
}

// Create groups so that numGroups × advancingPerGroup ≈ targetCount
function configFor(targetCount) {
  // Use 1 group × targetCount advancing (always seeded path)
  return { groups: makeGroups(1), advancingPerGroup: targetCount, wildcardCount: 0, wildcardRule: "none" };
}

function slotsFor(n) {
  const { groups, advancingPerGroup, wildcardCount, wildcardRule } = configFor(n);
  return buildKnockoutSlots(groups, advancingPerGroup, wildcardCount, wildcardRule);
}

function makeStandingRow(id, name, pts = 0) {
  return { participant: { id, name }, pts, gf: 0, ga: 0, won: 0, drawn: 0, lost: 0, played: 0 };
}

// ── _nextPow2 ─────────────────────────────────────────────────────

describe("_nextPow2", () => {
  it.each([
    [1, 1], [2, 2], [3, 4], [4, 4], [5, 8], [8, 8],
    [9, 16], [16, 16], [17, 32], [32, 32], [33, 64], [60, 64], [64, 64],
  ])("_nextPow2(%i) === %i", (n, expected) => {
    expect(_nextPow2(n)).toBe(expected);
  });
});

// ── Bracket size and BYE count for every required participant count ──

const bracketCases = [
  // [n, expectedSize, expectedByeCount, expectedRealMatches]
  [3,  4,  1,  1],
  [5,  8,  3,  1],
  [6,  8,  2,  2],
  [7,  8,  1,  3],
  [9,  16, 7,  1],
  [10, 16, 6,  2],
  [15, 16, 1,  7],
  [17, 32, 15, 1],
  [24, 32, 8,  8],
  [31, 32, 1,  15],
  [33, 64, 31, 1],
  [48, 64, 16, 16],
  [60, 64, 4,  28],
];

describe("buildKnockoutSlots — bracket size and BYE count", () => {
  it.each(bracketCases)(
    "n=%i → size=%i, BYEs=%i, real R1 matches=%i",
    (n, expectedSize, expectedByeCount, expectedRealMatches) => {
      const slots = slotsFor(n);

      expect(slots.length).toBe(expectedSize);

      const byeCount = slots.filter(s => s.isBye).length;
      expect(byeCount).toBe(expectedByeCount);

      const bracket = buildBracketFromSlots(slots);
      const r1 = bracket.rounds[0];
      const realMatches = r1.filter(m => !m.isBye).length;
      expect(realMatches).toBe(expectedRealMatches);
    },
  );
});

// ── BYEs always go to top seeds ───────────────────────────────────

describe("buildKnockoutSlots — top seeds receive BYEs", () => {
  it.each([3, 5, 9, 10, 15, 17, 33, 60])("n=%i: all BYE matches involve seeds 1..byeCount", (n) => {
    const slots    = slotsFor(n);
    const bracket  = buildBracketFromSlots(slots);
    const size     = slots.length;
    const byeCount = size - n;
    if (byeCount === 0) return; // no BYEs to check

    const r1        = bracket.rounds[0];
    const byeMatches = r1.filter(m => m.isBye && (m.p1 || m.p2));
    expect(byeMatches.length).toBe(byeCount);

    // In slotsFor(n) the single-group seeded path is used.
    // Seeds are assigned by rank: slot_A_0 = seed 1 (best), slot_A_1 = seed 2, …
    // The top byeCount seeds (slot_A_0 … slot_A_{byeCount-1}) should receive BYEs.
    const topSeedIds = new Set(
      Array.from({ length: byeCount }, (_, i) => `slot_A_${i}`),
    );
    for (const m of byeMatches) {
      const real = m.p1 ?? m.p2;
      expect(topSeedIds.has(real.id)).toBe(true);
    }
  });
});

// ── Bracket round count ───────────────────────────────────────────

describe("buildBracketFromSlots — round count", () => {
  it.each([
    [4,  2],
    [8,  3],
    [16, 4],
    [32, 5],
    [64, 6],
  ])("size=%i → %i rounds", (n, expectedRounds) => {
    const slots   = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `P${i}`, isBye: false, isTBD: true }));
    const bracket = buildBracketFromSlots(slots);
    expect(bracket.rounds.length).toBe(expectedRounds);
  });
});

// ── Crossover pairing ─────────────────────────────────────────────

describe("buildKnockoutSlots — crossover pairing (even groups, pow-2 pair count)", () => {
  it("2 groups × 2 advancing → A1vB2, A2vB1", () => {
    const groups = makeGroups(2);
    const slots  = buildKnockoutSlots(groups, 2);
    // pairs: [0,1], [2,3]
    expect(slots[0].name).toBe("1st Group A");
    expect(slots[1].name).toBe("2nd Group B");
    expect(slots[2].name).toBe("2nd Group A");
    expect(slots[3].name).toBe("1st Group B");
  });

  it("4 groups × 2 advancing → A1vB2, A2vB1, C1vD2, C2vD1", () => {
    const groups = makeGroups(4);
    const slots  = buildKnockoutSlots(groups, 2);
    expect(slots[0].name).toBe("1st Group A");
    expect(slots[1].name).toBe("2nd Group B");
    expect(slots[2].name).toBe("2nd Group A");
    expect(slots[3].name).toBe("1st Group B");
    expect(slots[4].name).toBe("1st Group C");
    expect(slots[5].name).toBe("2nd Group D");
    expect(slots[6].name).toBe("2nd Group C");
    expect(slots[7].name).toBe("1st Group D");
  });

  it("3 groups × 2 advancing → A1vB2, A2vB1, C1vBYE, C2vBYE", () => {
    const groups = makeGroups(3);
    const slots  = buildKnockoutSlots(groups, 2);
    expect(slots.length).toBe(8);
    expect(slots[0].name).toBe("1st Group A");
    expect(slots[1].name).toBe("2nd Group B");
    expect(slots[2].name).toBe("2nd Group A");
    expect(slots[3].name).toBe("1st Group B");
    expect(slots[4].isBye).toBe(false); // C1
    expect(slots[5].isBye).toBe(true);  // BYE for C1
    expect(slots[6].isBye).toBe(false); // C2
    expect(slots[7].isBye).toBe(true);  // BYE for C2
  });
});

// ── Non-pow2 crossover → seeded fallback ─────────────────────────

describe("buildKnockoutSlots — non-pow2 crossover falls back to seeded", () => {
  it("2 groups × 3 advancing (3 pairs, not pow2) uses seeded bracket", () => {
    const groups = makeGroups(2);
    const slots  = buildKnockoutSlots(groups, 3);
    // 6 total → size=8 → 2 BYEs, top 2 seeds (A1,B1) get BYEs
    expect(slots.length).toBe(8);
    const byeSlots = slots.filter(s => s.isBye);
    expect(byeSlots.length).toBe(2);
  });

  it("5 groups × 2 advancing (6 pairs, not pow2) uses seeded bracket", () => {
    const groups = makeGroups(5);
    const slots  = buildKnockoutSlots(groups, 2);
    // 10 total → size=16 → 6 BYEs
    expect(slots.length).toBe(16);
    const byeSlots = slots.filter(s => s.isBye);
    expect(byeSlots.length).toBe(6);
  });
});

// ── No duplicate slot IDs ─────────────────────────────────────────

describe("buildKnockoutSlots — no duplicate slot IDs", () => {
  it.each([3, 6, 7, 10, 15, 24, 60])("n=%i has no duplicate IDs", (n) => {
    const slots = slotsFor(n);
    const ids   = slots.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── resolveAbstractBracket: slot order never changes ─────────────

describe("resolveAbstractBracket — slot order preservation", () => {
  it("match IDs are identical before and after resolution", () => {
    const groups          = makeGroups(4);
    const slots           = buildKnockoutSlots(groups, 2);
    const abstractBracket = buildBracketFromSlots(slots);

    const standingsByGroup = groups.map((g) =>
      [0, 1].map((r) => makeStandingRow(`p_${g.name}_${r}`, `Player ${g.name}${r + 1}`)),
    );

    const slotMap = buildSlotResolutionMap(groups, standingsByGroup, 2);
    const resolved = resolveAbstractBracket(abstractBracket, slotMap);

    // Same number of rounds
    expect(resolved.rounds.length).toBe(abstractBracket.rounds.length);

    // Same match IDs in every round
    for (let ri = 0; ri < abstractBracket.rounds.length; ri++) {
      const absIds = abstractBracket.rounds[ri].map(m => m.id);
      const resIds = resolved.rounds[ri].map(m => m.id);
      expect(resIds).toEqual(absIds);
    }
  });

  it("TBD slot names are replaced by real participant names", () => {
    const groups = makeGroups(2);
    const slots  = buildKnockoutSlots(groups, 2); // A1vB2, A2vB1
    const ab     = buildBracketFromSlots(slots);

    const standingsByGroup = [
      [makeStandingRow("a1","Alice"), makeStandingRow("a2","Alan")],
      [makeStandingRow("b1","Bob"),   makeStandingRow("b2","Beth")],
    ];
    const slotMap = buildSlotResolutionMap(groups, standingsByGroup, 2);
    const resolved = resolveAbstractBracket(ab, slotMap);

    const r1 = resolved.rounds[0];
    // Match 0: A1 vs B2 → Alice vs Beth
    expect(r1[0].p1.name).toBe("Alice");
    expect(r1[0].p2.name).toBe("Beth");
    // Match 1: A2 vs B1 → Alan vs Bob
    expect(r1[1].p1.name).toBe("Alan");
    expect(r1[1].p2.name).toBe("Bob");
  });

  it("Group A 1st always plays Group B 2nd (not reshuffled) regardless of standings", () => {
    const groups = makeGroups(2);
    const slots  = buildKnockoutSlots(groups, 2);
    const ab     = buildBracketFromSlots(slots);

    // Reverse standings — top seed is now different player
    const standingsByGroup = [
      [makeStandingRow("z","Zara"), makeStandingRow("y","Yosef")],
      [makeStandingRow("x","Xena"), makeStandingRow("w","Will")],
    ];
    const slotMap = buildSlotResolutionMap(groups, standingsByGroup, 2);
    const resolved = resolveAbstractBracket(ab, slotMap);

    // slot 0 = A-rank0 → Zara (1st of A), slot 1 = B-rank1 → Will (2nd of B)
    expect(resolved.rounds[0][0].p1.name).toBe("Zara");
    expect(resolved.rounds[0][0].p2.name).toBe("Will");
    // slot 2 = A-rank1 → Yosef (2nd of A), slot 3 = B-rank0 → Xena (1st of B)
    expect(resolved.rounds[0][1].p1.name).toBe("Yosef");
    expect(resolved.rounds[0][1].p2.name).toBe("Xena");
  });
});

// ── BYE auto-advance propagation ─────────────────────────────────

describe("resolveAbstractBracket — BYE winner propagates to R2", () => {
  it("BYE winner in R1 appears in R2 after resolution", () => {
    const groups = makeGroups(3); // 3g×2 → C1 and C2 get BYEs
    const slots  = buildKnockoutSlots(groups, 2);
    const ab     = buildBracketFromSlots(slots);

    const standingsByGroup = [
      [makeStandingRow("a1","A-First"), makeStandingRow("a2","A-Second")],
      [makeStandingRow("b1","B-First"), makeStandingRow("b2","B-Second")],
      [makeStandingRow("c1","C-First"), makeStandingRow("c2","C-Second")],
    ];
    const slotMap = buildSlotResolutionMap(groups, standingsByGroup, 2);
    const resolved = resolveAbstractBracket(ab, slotMap);

    const r1 = resolved.rounds[0];
    const r2 = resolved.rounds[1];

    // slots 4,5 = C1 vs BYE → C-First auto-advances to R2
    // slots 6,7 = C2 vs BYE → C-Second auto-advances to R2
    const byeMatches = r1.filter(m => m.isBye && (m.p1 || m.p2));
    expect(byeMatches.length).toBe(2);

    // Each BYE winner must appear in R2
    for (const m of byeMatches) {
      const winner = m.winner;
      const inR2   = r2.some(m2 => m2.p1?.id === winner?.id || m2.p2?.id === winner?.id);
      expect(inR2).toBe(true);
    }
  });
});

// ── Wildcard slots ────────────────────────────────────────────────

describe("buildKnockoutSlots — wildcard slots", () => {
  it("wildcards appear in the slot list", () => {
    const groups = makeGroups(4);
    const slots  = buildKnockoutSlots(groups, 2, 2, "best_3rd_place");
    // 4g×2 + 2 wildcards = 10 → size 16
    expect(slots.length).toBe(16);
    const wcSlots = slots.filter(s => s.isWildcard);
    expect(wcSlots.length).toBe(2);
    expect(wcSlots[0].name).toContain("Best");
    expect(wcSlots[1].name).toContain("Best");
  });

  it("wildcard slot IDs are resolved by buildSlotResolutionMap", () => {
    const groups = makeGroups(2);
    const slots  = buildKnockoutSlots(groups, 2, 1, "best_3rd_place");
    const ab     = buildBracketFromSlots(slots);

    const standingsByGroup = [
      [makeStandingRow("a1","Alpha"), makeStandingRow("a2","Bravo")],
      [makeStandingRow("b1","Charlie"), makeStandingRow("b2","Delta")],
    ];
    const wildcardStandings = [makeStandingRow("wc1","Wildcard One", 3)];
    const slotMap = buildSlotResolutionMap(groups, standingsByGroup, 2, wildcardStandings, 1);

    expect(slotMap.has("slot_wc_0")).toBe(true);
    expect(slotMap.get("slot_wc_0").name).toBe("Wildcard One");

    const resolved = resolveAbstractBracket(ab, slotMap);
    const allNames = resolved.rounds[0].flatMap(m => [m.p1?.name, m.p2?.name]).filter(Boolean);
    expect(allNames).toContain("Wildcard One");
  });
});
