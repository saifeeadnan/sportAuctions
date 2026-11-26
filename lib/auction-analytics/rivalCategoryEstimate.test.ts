import { describe, it, expect } from "vitest";
import { computeRivalCategoryEstimates } from "./rivalCategoryEstimate";
import type { AnalyticsTeam, AnalyticsCategory, AnalyticsPlayer, SaleEvent, RivalCategoryEstimateInput } from "./types";

function team(budgetRemaining: number): AnalyticsTeam[] {
  return [{ id: "rival", name: "Rival", budgetRemaining, totalSlots: 15 }];
}

const CATEGORIES: AnalyticsCategory[] = [
  { id: "platinum", name: "Platinum", basePrice: 10, bidIncrement: null },
  { id: "gold", name: "Gold", basePrice: 5, bidIncrement: null },
  { id: "silver", name: "Silver", basePrice: 2, bidIncrement: null },
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

    // Each estimate is forward-looking-only, so it's already the remaining
    // budget: gold=40, silver=20 -> reserved for others = 60. available for
    // platinum = 90 - 60 = 30. remainingEstimatedCount: liveAvgPrice for
    // platinum is 10 (the one sale), 30/10 = 3 (its own estimate converts
    // straight to a count, no netting against the 1 already bought).
    // affordable price = 30 / 3 = 10.
    expect(platinum.remainingEstimatedCount).toBe(3);
    expect(platinum.estimatedAffordablePrice).toBe(10);
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
    // budgetRemaining = 90 (authoritative, as passed in). Reserved for BOTH
    // other categories: platinum's remaining estimate is 10 (its own number,
    // not netted against its 1 actual sale), silver's is 10 -> reserved =
    // 20. Available for gold = 90 - 20 = 70. Gold's own liveAvgPrice falls
    // back to base price (5, nothing sold in it yet), so estimated count =
    // 10/5 = 2, affordable price = 70/2 = 35. A hardcoded 2-category
    // (platinum-then-gold) cascade would have missed silver's reserve
    // entirely and gotten this wrong.
    expect(gold.estimatedAffordablePrice).toBe(35);
  });

  it("ignores how much a team has already bought in a category — the estimate is forward-looking spend only", () => {
    const players = [player("p1", "platinum"), player("p2", "platinum"), player("p3", "platinum"), player("p4", "platinum")];
    const sales: SaleEvent[] = [
      { playerId: "p1", teamId: "rival", price: 10, timestamp: "t1" },
      { playerId: "p2", teamId: "rival", price: 10, timestamp: "t2" },
      { playerId: "p3", teamId: "rival", price: 10, timestamp: "t3" },
      { playerId: "p4", teamId: "rival", price: 10, timestamp: "t4" },
    ];
    // The team already bought 4 Platinum players (40 total, e.g. retained
    // picks) — none of that should count against or reduce this "20 more"
    // estimate, which liveAvg (10) converts to 2 more picks.
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 20 },
    ];

    const results = computeRivalCategoryEstimates(team(60), CATEGORIES, players, sales, estimates);
    const platinum = results.find((r) => r.categoryId === "platinum")!;

    expect(platinum.remainingEstimatedCount).toBe(2);
    expect(platinum.estimatedAffordablePrice).toBe(30);
    // The already-bought count/spend is still reported, just not blended in.
    expect(platinum.actualCount).toBe(4);
    expect(platinum.actualSpent).toBe(40);
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

  it("infers the one missing category's budget from the team's current remaining budget when the other N-1 are specified", () => {
    // Platinum=30 and Gold=40 specified (both forward-looking-only), Silver
    // left blank -> Silver should be inferred as 100 - (30+40) = 30.
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
    // Specified categories (130) already exceed the team's current
    // remaining budget (100) — the inferred remainder can't be negative.
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 90 },
      { targetTeamId: "rival", categoryId: "gold", estimatedBudget: 40 },
    ];

    const results = computeRivalCategoryEstimates(team(100), CATEGORIES, [], [], estimates);
    const silver = results.find((r) => r.categoryId === "silver")!;

    expect(silver.estimatedBudget).toBe(0);
    expect(silver.isInferred).toBe(true);
  });

  it("infers from current remaining budget only — already-spent money in other categories isn't added back in", () => {
    // Team started with 100, already spent 20 on a platinum sale, so its
    // current remaining budget is 80. Platinum's own forward-looking
    // estimate is 20 (20 more, unrelated to the 20 already spent), Gold=40
    // specified -> Silver inferred as 80 - (20+40) = 20.
    const players = [player("p1", "platinum")];
    const sales: SaleEvent[] = [{ playerId: "p1", teamId: "rival", price: 20, timestamp: "t1" }];
    const estimates: RivalCategoryEstimateInput[] = [
      { targetTeamId: "rival", categoryId: "platinum", estimatedBudget: 20 },
      { targetTeamId: "rival", categoryId: "gold", estimatedBudget: 40 },
    ];

    const results = computeRivalCategoryEstimates(team(80), CATEGORIES, players, sales, estimates);
    const silver = results.find((r) => r.categoryId === "silver")!;

    expect(silver.estimatedBudget).toBe(20);
    expect(silver.isInferred).toBe(true);
  });
});
