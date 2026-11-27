import { describe, it, expect } from "vitest";
import { reserveUnit, legalMaxBidEnforced, resolvePredictedLot, resolveContestedLot, type TeamRunState } from "./simulateLot";
import type { AnalyticsCategory, AnalyticsPlayer, AnalyticsTeam, SaleEvent } from "./types";

function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const GOLD: AnalyticsCategory = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
const SILVER: AnalyticsCategory = { id: "silver", name: "Silver", basePrice: 5, bidIncrement: null };

function player(id: string, categoryId = "gold", basePrice = 10): AnalyticsPlayer {
  return { id, name: id, categoryId, basePrice };
}

describe("reserveUnit", () => {
  it("is the minimum base price across all categories", () => {
    expect(reserveUnit([GOLD, SILVER])).toBe(5);
  });

  it("is 0 when there are no categories", () => {
    expect(reserveUnit([])).toBe(0);
  });
});

describe("legalMaxBidEnforced", () => {
  it("returns 0 when no slots remain", () => {
    expect(legalMaxBidEnforced({ budgetRemaining: 1000, slotsRemaining: 0 }, 10)).toBe(0);
  });

  it("returns the full budget when this is the last slot", () => {
    expect(legalMaxBidEnforced({ budgetRemaining: 500, slotsRemaining: 1 }, 10)).toBe(500);
  });

  it("reserves one unit per slot still needed after this pick", () => {
    expect(legalMaxBidEnforced({ budgetRemaining: 1000, slotsRemaining: 5 }, 10)).toBe(960);
  });
});

describe("resolvePredictedLot", () => {
  const p1 = player("p1");

  it("uses the predicted amount when one was given", () => {
    const prediction = { playerId: "p1", predictedWinnerTeamId: "rival", predictedAmount: 50, predictedMinAmount: null };
    const teamState = new Map<string, TeamRunState>([["rival", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolvePredictedLot({
      player: p1,
      category: GOLD,
      prediction,
      teamState,
      unit: 10,
      players: [p1],
      salesSoFar: [],
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rival", price: 50, source: "predicted" });
  });

  it("snaps the price down to the nearest valid bid-increment step, never up", () => {
    const category: AnalyticsCategory = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: 25 };
    const prediction = { playerId: "p1", predictedWinnerTeamId: "rival", predictedAmount: 70, predictedMinAmount: null };
    const teamState = new Map<string, TeamRunState>([["rival", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolvePredictedLot({
      player: p1,
      category,
      prediction,
      teamState,
      unit: 10,
      players: [p1],
      salesSoFar: [],
    });

    // Valid steps from base price 10 are 10, 35, 60, 85, ... — 70 snaps down to 60.
    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rival", price: 60, source: "predicted" });
  });

  it("falls back to the live category average when no amount was predicted", () => {
    const prediction = { playerId: "p1", predictedWinnerTeamId: "rival", predictedAmount: null, predictedMinAmount: null };
    const teamState = new Map<string, TeamRunState>([["rival", { budgetRemaining: 1000, slotsRemaining: 5 }]]);
    const otherGoldPlayer = player("p0");
    const salesSoFar: SaleEvent[] = [{ playerId: "p0", teamId: "rival", price: 30, timestamp: "t0" }];

    const lot = resolvePredictedLot({
      player: p1,
      category: GOLD,
      prediction,
      teamState,
      unit: 10,
      players: [p1, otherGoldPlayer],
      salesSoFar,
    });

    expect(lot).toMatchObject({ teamId: "rival", price: 30 });
  });

  it("falls back to base price when no amount was predicted and nothing has sold in the category", () => {
    const prediction = { playerId: "p1", predictedWinnerTeamId: "rival", predictedAmount: null, predictedMinAmount: null };
    const teamState = new Map<string, TeamRunState>([["rival", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolvePredictedLot({
      player: p1,
      category: GOLD,
      prediction,
      teamState,
      unit: 10,
      players: [p1],
      salesSoFar: [],
    });

    expect(lot).toMatchObject({ teamId: "rival", price: 10 });
  });

  it("clamps the price down to the winner's legal max when the predicted amount exceeds it, even though base price would still fit", () => {
    // slotsRemaining: 2, budgetRemaining: 40 -> legalMaxBidEnforced is
    // 40 - 10*1 = 30 — below the predicted 50, but still >= base price (10),
    // so resolvePredictedLot is a valid call (the caller's gate passes) and
    // should clamp to the legal max rather than the raw predicted amount.
    const prediction = { playerId: "p1", predictedWinnerTeamId: "rival", predictedAmount: 50, predictedMinAmount: null };
    const teamState = new Map<string, TeamRunState>([["rival", { budgetRemaining: 40, slotsRemaining: 2 }]]);

    const lot = resolvePredictedLot({
      player: p1,
      category: GOLD,
      prediction,
      teamState,
      unit: 10,
      players: [p1],
      salesSoFar: [],
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rival", price: 30, source: "predicted" });
  });

  it("floors the price up to a predicted minimum, even when the raw estimate (no amount given) falls below it", () => {
    const prediction = {
      playerId: "p1",
      predictedWinnerTeamId: "rival",
      predictedAmount: null,
      predictedMinAmount: 25,
    };
    const teamState = new Map<string, TeamRunState>([["rival", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolvePredictedLot({
      player: p1,
      category: GOLD,
      prediction,
      teamState,
      unit: 10,
      players: [p1],
      salesSoFar: [],
    });

    // No amount predicted and nothing sold yet -> raw would fall back to
    // base price (10), but the predicted minimum (25) floors it up instead.
    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rival", price: 25, source: "predicted" });
  });
});

describe("resolveContestedLot", () => {
  const p1 = player("p1");
  const self: AnalyticsTeam = { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 15 };

  it("self wins outright when guidance says BID and the rng blocks every rival", () => {
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 500, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 5 }],
      ["rival", { budgetRemaining: 500, slotsRemaining: 3 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(["p1"]),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000, // large enough that urgency never dominates richness here
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.9]), // 0.9 >= rival's 0.85 contest probability -> rival never bids
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "self", price: 960, source: "self" });
  });

  it("returns unsold when no team can legally afford the base price", () => {
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 20, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }], // self out of slots
      ["rival", { budgetRemaining: 20, slotsRemaining: 5 }], // legal max far below base price
    ]);
    const expensivePlayer = player("costly", "gold", 10000);

    const lot = resolveContestedLot({
      player: expensivePlayer,
      category: GOLD,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000, // large enough that urgency never dominates richness here
      remainingPoolBasePricesForSelf: [],
      players: [expensivePlayer],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "costly", categoryId: "gold", unsold: true });
  });

  it("excludes a team with 0 slots left even when it would otherwise be the richest", () => {
    const rivalA: AnalyticsTeam = { id: "rivalA", name: "RivalA", budgetRemaining: 100000, totalSlots: 15 };
    const rivalB: AnalyticsTeam = { id: "rivalB", name: "RivalB", budgetRemaining: 100, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rivalA", { budgetRemaining: 100000, slotsRemaining: 0 }], // excluded despite being richest
      ["rivalB", { budgetRemaining: 100, slotsRemaining: 2 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rivalA, rivalB],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000, // large enough that urgency never dominates richness here
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.1, 0.5]), // contest triggers, amount interpolates to the midpoint
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rivalB", price: 50, source: "contested" });
  });

  it("never produces a self-candidate when self has marked the player AVOID", () => {
    // Self can easily afford it and no rivals exist — if self were ever a
    // candidate it would win by default. It doesn't, so the lot goes unsold.
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(["p1"]),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000, // large enough that urgency never dominates richness here
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", unsold: true });
  });

  it("breaks a tie between two equal bids using the injected rng, not insertion order", () => {
    const rivalA: AnalyticsTeam = { id: "rivalA", name: "RivalA", budgetRemaining: 100, totalSlots: 15 };
    const rivalB: AnalyticsTeam = { id: "rivalB", name: "RivalB", budgetRemaining: 100, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rivalA", { budgetRemaining: 100, slotsRemaining: 2 }],
      ["rivalB", { budgetRemaining: 100, slotsRemaining: 2 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rivalA, rivalB],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000, // large enough that urgency never dominates richness here
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      // rivalA: contest(0.1) + amount(0.5) -> 50. rivalB: contest(0.2) + amount(0.5) -> 50 (tied).
      // Tie-break draw of 0.1 (< 0.5) swaps the winner from the first-seen rivalA to rivalB.
      rng: sequenceRng([0.1, 0.5, 0.2, 0.5, 0.1]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rivalB", price: 50, source: "contested" });
  });

  it("stops self from bidding in a category once its cumulative spend there reaches the budget target", () => {
    // Self has plenty of legal room and no rivals exist — if self were ever
    // a candidate it would win by default. It doesn't, so the lot goes
    // unsold: the category spend cap (already at 100, target is 100) blocks it.
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map([["gold", 100]]),
      selfCategorySpentSoFar: 100,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000, // large enough that urgency never dominates richness here
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", unsold: true });
  });

  it("falls back to base price once a must-have's category budget is already exhausted — budgets take priority over the wish list", () => {
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(["p1"]),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map([["gold", 100]]),
      selfCategorySpentSoFar: 500, // already way over the 100 target -> 0 left in the pool
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000, // large enough that urgency never dominates richness here
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    // No pool left (100 target - 500 already spent, floored at 0) means the
    // must-have only gets p1's own base price (10) to work with, not the
    // legal max (960) it would have gotten pre-fix — it can still win at
    // base price if nobody outbids it, but it no longer blows through the
    // category budget just because it's a must-have.
    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "self", price: 10, source: "self" });
  });

  it("lets the desperation fallback bypass an exhausted category budget cap rather than guarantee an unfilled slot", () => {
    // Not a must-have, not avoided, and way over its tiny 10-target in this
    // category (overCategoryBudgetCap -> true) -- would normally never be
    // considered again in this category. But this is the LAST lot
    // (remainingLotsAfterThis: 0) and self still needs its one remaining
    // slot (slotsRemaining: 1), so the desperation path must still kick in:
    // a spent-out category target is a plan, not a promise to finish with
    // an empty slot and unspent budget. The category's own pool is fully
    // exhausted (0 left), so the attempt is floored at base price (10),
    // not the full legal max (1000) — bypassing the "don't even try" veto
    // must not also let the PRICE ignore the same budget target.
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 1 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map([["gold", 10]]),
      selfCategorySpentSoFar: 500, // way over the 10 target -> 0 left in the pool
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 0, // the very last lot
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "self", price: 10, source: "self" });
  });

  it("caps the desperation fallback's price at what's LEFT of the category budget, not the full legal max", () => {
    // 200 target, 150 already spent -> 50 left in the pool. Legal max here
    // is ~1000 (budgetRemaining=1000, 1 slot left) — if the cap weren't
    // applied, desperation would bid far more than this category's own
    // remaining budget allows.
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 1 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map([["gold", 200]]),
      selfCategorySpentSoFar: 150, // 50 left of the 200 target
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 0,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "self", price: 50, source: "self" });
  });

  it("still never bids on an avoid-tagged player even in genuine desperation, category cap or not", () => {
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 1 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(["p1"]),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 0,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", unsold: true });
  });

  it("caps a must-have's bid at what's LEFT of the category budget, not the flat target, once part of it is already spent", () => {
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 5 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(["p1"]),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map([["gold", 100]]),
      selfCategorySpentSoFar: 60, // 40 left of the 100 target, not a fresh 100
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "self", price: 40, source: "self" });
  });

  it("lets a relatively poor rival contest anyway once its urgency (slots needed vs. lots left) outweighs its low richness", () => {
    const rivalRich: AnalyticsTeam = { id: "rivalRich", name: "RivalRich", budgetRemaining: 100000, totalSlots: 15 };
    const rivalPoor: AnalyticsTeam = { id: "rivalPoor", name: "RivalPoor", budgetRemaining: 100, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rivalRich", { budgetRemaining: 100000, slotsRemaining: 1 }], // low urgency: 1 slot, 3 lots left
      ["rivalPoor", { budgetRemaining: 100, slotsRemaining: 3 }], // high urgency: needs all 3 lots left
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rivalRich, rivalPoor],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 3,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      // rivalRich: richness-only probability is 0.85 (it's the richest) — 0.9
      // fails that, proving it did NOT get an urgency boost (1 slot / 3 lots
      // left = low urgency). rivalPoor: richness-only probability would be
      // ~0.15 (far from the richest) — 0.95 would fail that, but its urgency
      // (3 slots needed / 3 lots left = 1.0) pushes it to contest anyway.
      rng: sequenceRng([0.9, 0.95, 0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rivalPoor", price: 45, source: "contested" });
  });

  it("clamps urgency at 1.0 even when slots remaining exceed lots left", () => {
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 100, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rival", { budgetRemaining: 100, slotsRemaining: 10 }], // far more slots than lots left
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1, // slots (10) far exceed lots left (1) -> urgency should clamp at 1.0, not blow up
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.999, 0.5]), // would fail almost any sane probability except a clamped 1.0
    });

    expect(lot).toMatchObject({ teamId: "rival", source: "contested" });
  });

  it("snaps a contested winner's randomized amount down to the nearest bid-increment step", () => {
    const category: AnalyticsCategory = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: 25 };
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 100, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rival", { budgetRemaining: 100, slotsRemaining: 2 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      // legalMax=90, low=10 (no sales yet) -> raw amount = 10 + 0.7*(90-10) = 66.
      // Valid steps from base price 10 are 10, 35, 60, 85, ... — 66 snaps down to 60.
      rng: sequenceRng([0.1, 0.7]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rival", price: 60, source: "contested" });
  });

  it("excludes a rival the manager's own 'My estimates' already shows as over its category budget", () => {
    // Rival is otherwise a clear, legal, affordable winner — the only thing
    // stopping it is the manager's own estimate for its category already
    // being exhausted (self is also excluded here, via 0 slots).
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 100000, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rival", { budgetRemaining: 100000, slotsRemaining: 5 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(["rival"]),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.1, 0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", unsold: true });
  });

  it("caps the winning price at a predicted ceiling, even when the raw bid and legal max both far exceed it", () => {
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 100000, totalSlots: 15 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rival", { budgetRemaining: 100000, slotsRemaining: 15 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      priceCeiling: 20, // the manager's own predicted price for this player
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      // Contests (0.5 < richness probability), then rolls a raw amount near
      // its ~20,000 fair-share high end — the ceiling clamps it down to 20.
      rng: sequenceRng([0.5, 0.99]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rival", price: 20, source: "contested" });
  });

  it("floors the winning price up to a predicted minimum, even when the raw bid lands well below it", () => {
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 1000, totalSlots: 5 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 0 }],
      ["rival", { budgetRemaining: 1000, slotsRemaining: 5 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      priceFloor: 100, // the manager's own predicted minimum for this player
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 1000,
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      // Contests (0.1 < richness probability), then rolls a raw amount near
      // the low end of its range (10 + 0.01*590 ≈ 15.9) — the floor raises
      // it to 100, well within rival's legal room (960).
      rng: sequenceRng([0.1, 0.01]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", teamId: "rival", price: 100, source: "contested" });
  });

  it("still bids self even on a PASS signal once there's no slack left to skip this lot and still fill the roster", () => {
    // Budget target (5) is below base price (10) -> computeBidGuidance
    // always PASSes for self on this category, strategy-wise. Rival can't
    // legally afford it (legalMax 5 < base price 10), so without an
    // urgency override this lot would simply go unsold even though self
    // still has exactly one slot left and this is the last lot available.
    const rival: AnalyticsTeam = { id: "rival", name: "Rival", budgetRemaining: 5, totalSlots: 1 };
    const teamState = new Map<string, TeamRunState>([
      ["self", { budgetRemaining: 1000, slotsRemaining: 1 }],
      ["rival", { budgetRemaining: 5, slotsRemaining: 1 }],
    ]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self, rival],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(),
      budgetTargetByCategoryId: new Map([["gold", 5]]),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 0, // this is the last lot — zero slack
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toMatchObject({ teamId: "self", source: "self" });
  });

  it("never overrides an avoid-tagged player with the no-slack desperation fallback", () => {
    const teamState = new Map<string, TeamRunState>([["self", { budgetRemaining: 1000, slotsRemaining: 1 }]]);

    const lot = resolveContestedLot({
      player: p1,
      category: GOLD,
      teams: [self],
      selfTeamId: "self",
      teamState,
      unit: 10,
      mustHaveIds: new Set(),
      avoidIds: new Set(["p1"]),
      budgetTargetByCategoryId: new Map(),
      selfCategorySpentSoFar: 0,
      teamsOverEstimatedCategoryBudget: new Set(),
      otherMustHavesRemainingInCategory: 0,
      remainingLotsAfterThis: 0, // zero slack — would otherwise trigger desperation
      remainingPoolBasePricesForSelf: [],
      players: [p1],
      salesSoFar: [],
      rng: sequenceRng([0.5]),
    });

    expect(lot).toEqual({ playerId: "p1", categoryId: "gold", unsold: true });
  });
});
