import { describe, it, expect } from "vitest";
import { computeRivalCategoryEstimates } from "./rivalCategoryEstimate";
import type { AnalyticsTeam, AnalyticsCategory, AnalyticsPlayer, SaleEvent, RivalCategoryEstimateInput } from "./types";

function team(budgetRemaining: number): AnalyticsTeam[] {
  return [{ id: "rival", name: "Rival", budgetRemaining, totalSlots: 15 }];
}

const CATEGORIES: AnalyticsCategory[] = [
  { id: "platinum", name: "Platinum", basePrice: 10 },
  { id: "gold", name: "Gold", basePrice: 5 },
  { id: "silver", name: "Silver", basePrice: 2 },
];

function player(id: string, categoryId: string): AnalyticsPlayer {
  return { id, name: id, categoryId, basePrice: 0 };
}

describe("computeRivalCategoryEstimates", () => {
  it("reserves every other estimated category's remaining budget when computing one category's affordable price", () => {
    const players = [player("p1", "platinum")];
    const sales: SaleEvent[] = [{ playerId: "p1", teamId: "rival", price: 10, timestamp: "t1" }];
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 30 },
      { targetTeamId: "rival", categoryId: "gold", estimatedBudget: 40 },
      { targetTeamId: "rival", categoryId: "silver", estimatedBudget: 20 },
    ];

    // Team's authoritative current budgetRemaining, as the host system
    // would already track it (here: after the one platinum sale, 90 left).
    const results = computeRivalCategoryEstimates(team(90), CATEGORIES, players, sales, estimates);
    const platinum = results.find((r) => r.categoryId === "platinum")!;

    // remaining estimated: gold=40, silver=20 -> reserved for others = 60.
    // available for platinum = 90 - 60 = 30. remainingEstimatedCount: liveAvgPrice
    // for platinum is 10 (the one sale), estimatedTotalCount = 30/10 = 3, actual
    // count 1 -> remaining 2. affordable price = 30 / 2 = 15.
    expect(platinum.remainingEstimatedCount).toBe(2);
    expect(platinum.estimatedAffordablePrice).toBe(15);
  });

  it("handles 3+ categories, not just a hardcoded 2 (Excel bug 4)", () => {
    // Same fixture as above already covers 3 categories at once — platinum's
    // reserve correctly sums *both* gold and silver, not just one.
    const players = [player("p1", "platinum")];
    const sales: SaleEvent[] = [{ playerId: "p1", teamId: "rival", price: 10, timestamp: "t1" }];
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 10 },
      { targetTeamId: "rival", categoryId: "gold", estimatedBudget: 10 },
      { targetTeamId: "rival", categoryId: "silver", estimatedBudget: 10 },
    ];

    const results = computeRivalCategoryEstimates(team(90), CATEGORIES, players, sales, estimates);
    const gold = results.find((r) => r.categoryId === "gold")!;
    // budgetRemaining = 90 (authoritative, as passed in). Reserved for BOTH other categories: platinum's
    // remaining is 0 (its 10 estimate was fully spent already), silver's is
    // 10 -> reserved = 10. Available for gold = 90 - 10 = 80. Gold's own
    // liveAvgPrice falls back to base price (5, nothing sold in it yet), so
    // estimated count = 10/5 = 2, affordable price = 80/2 = 40. A hardcoded
    // 2-category (platinum-then-gold) cascade would have missed silver's
    // reserve entirely and gotten this wrong.
    expect(gold.estimatedAffordablePrice).toBe(40);
  });

  it("clamps an overshot category to done (0 remaining, no negative affordable price) instead of the Excel's =0-only check", () => {
    const players = [player("p1", "platinum"), player("p2", "platinum"), player("p3", "platinum"), player("p4", "platinum")];
    const sales: SaleEvent[] = [
      { playerId: "p1", teamId: "rival", price: 10, timestamp: "t1" },
      { playerId: "p2", teamId: "rival", price: 10, timestamp: "t2" },
      { playerId: "p3", teamId: "rival", price: 10, timestamp: "t3" },
      { playerId: "p4", teamId: "rival", price: 10, timestamp: "t4" },
    ];
    // Estimated only 2 Platinum players (20 / liveAvg 10), but the team
    // already bought 4 — a real overshoot.
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 20 },
    ];

    const results = computeRivalCategoryEstimates(team(60), CATEGORIES, players, sales, estimates);
    const platinum = results.find((r) => r.categoryId === "platinum")!;

    expect(platinum.remainingEstimatedCount).toBe(0);
    expect(platinum.estimatedAffordablePrice).toBeNull();
  });

  it("returns nulls for a category with no estimate set, while still reporting real actuals", () => {
    const players = [player("p1", "gold")];
    const sales: SaleEvent[] = [{ playerId: "p1", teamId: "rival", price: 7, timestamp: "t1" }];

    const results = computeRivalCategoryEstimates(team(93), CATEGORIES, players, sales, []);
    const gold = results.find((r) => r.categoryId === "gold")!;

    expect(gold.estimatedBudget).toBeNull();
    expect(gold.isInferred).toBe(false);
    expect(gold.remainingEstimatedCount).toBeNull();
    expect(gold.estimatedAffordablePrice).toBeNull();
    expect(gold.actualSpent).toBe(7);
    expect(gold.actualCount).toBe(1);
  });

  it("infers the one missing category's budget from the team's total spendable budget when the other N-1 are specified", () => {
    // No sales yet -> total spendable budget is just the current
    // budgetRemaining (100). Platinum=30 and Gold=40 specified, Silver left
    // blank -> Silver should be inferred as 100 - (30+40) = 30.
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 30 },
      { targetTeamId: "rival", categoryId: "gold", estimatedBudget: 40 },
    ];

    const results = computeRivalCategoryEstimates(team(100), CATEGORIES, [], [], estimates);
    const silver = results.find((r) => r.categoryId === "silver")!;
    const platinum = results.find((r) => r.categoryId === "platinum")!;

    expect(silver.estimatedBudget).toBe(30);
    expect(silver.isInferred).toBe(true);
    // Explicitly-set categories are never marked inferred.
    expect(platinum.isInferred).toBe(false);
  });

  it("does not infer when 2+ categories are missing — not enough information to disentangle them", () => {
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 30 },
    ];

    const results = computeRivalCategoryEstimates(team(100), CATEGORIES, [], [], estimates);
    const gold = results.find((r) => r.categoryId === "gold")!;
    const silver = results.find((r) => r.categoryId === "silver")!;

    expect(gold.estimatedBudget).toBeNull();
    expect(silver.estimatedBudget).toBeNull();
  });

  it("clamps an inferred budget at 0 rather than going negative", () => {
    // Specified categories (130) already exceed the team's total spendable
    // budget (100) — the inferred remainder can't be negative.
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 90 },
      { targetTeamId: "rival", categoryId: "gold", estimatedBudget: 40 },
    ];

    const results = computeRivalCategoryEstimates(team(100), CATEGORIES, [], [], estimates);
    const silver = results.find((r) => r.categoryId === "silver")!;

    expect(silver.estimatedBudget).toBe(0);
    expect(silver.isInferred).toBe(true);
  });

  it("uses total spendable budget (remaining + already spent), not just current remaining, as the basis for inference", () => {
    // Team started with 100, already spent 20 on a platinum sale -> total
    // spendable budget is 20 (spent) + 80 (remaining) = 100, same as if
    // nothing had sold yet. Gold=40 specified, Silver inferred.
    const players = [player("p1", "platinum")];
    const sales: SaleEvent[] = [{ playerId: "p1", teamId: "rival", price: 20, timestamp: "t1" }];
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 20 },
      { targetTeamId: "rival", categoryId: "gold", estimatedBudget: 40 },
    ];

    const results = computeRivalCategoryEstimates(team(80), CATEGORIES, players, sales, estimates);
    const silver = results.find((r) => r.categoryId === "silver")!;

    expect(silver.estimatedBudget).toBe(40);
    expect(silver.isInferred).toBe(true);
  });
});
