import { describe, it, expect } from "vitest";
import { computeSimulationAggregateSummary } from "./simulationSummary";
import type { SimulationRun } from "./simulateAuction";
import type { AuctionAnalyticsSnapshot } from "./types";

function baseSnapshot(overrides: Partial<AuctionAnalyticsSnapshot> = {}): AuctionAnalyticsSnapshot {
  return {
    teams: [],
    categories: [],
    players: [],
    sales: [],
    unsold: [],
    selfTeamId: "self",
    wishlist: [],
    rivalEstimates: [],
    predictions: [],
    budgetTargets: [],
    ...overrides,
  };
}

describe("computeSimulationAggregateSummary", () => {
  const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
  const p1 = { id: "p1", name: "p1", categoryId: "gold", basePrice: 10 }; // MUST_HAVE
  const p2 = { id: "p2", name: "p2", categoryId: "gold", basePrice: 10 }; // AVOID — split outcome
  const p3 = { id: "p3", name: "p3", categoryId: "gold", basePrice: 10 }; // AVOID — never resolves

  const snapshot = baseSnapshot({
    teams: [
      { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 15 },
      { id: "rivalA", name: "RivalA", budgetRemaining: 1000, totalSlots: 15 },
      { id: "rivalB", name: "RivalB", budgetRemaining: 1000, totalSlots: 15 },
    ],
    categories: [category],
    players: [p1, p2, p3],
    wishlist: [
      { playerId: "p1", type: "MUST_HAVE" },
      { playerId: "p2", type: "AVOID" },
      { playerId: "p3", type: "AVOID" },
    ],
  });

  const runs: SimulationRun[] = [
    {
      seed: 1,
      lots: [
        { playerId: "p1", categoryId: "gold", teamId: "self", price: 20, source: "self" },
        { playerId: "p2", categoryId: "gold", teamId: "rivalA", price: 15, source: "contested" },
      ],
    },
    {
      seed: 2,
      lots: [
        { playerId: "p1", categoryId: "gold", teamId: "self", price: 25, source: "self" },
        { playerId: "p2", categoryId: "gold", teamId: "self", price: 12, source: "self" },
      ],
    },
    {
      seed: 3,
      lots: [
        { playerId: "p1", categoryId: "gold", teamId: "self", price: 30, source: "self" },
        { playerId: "p2", categoryId: "gold", teamId: "rivalB", price: 18, source: "contested" },
      ],
    },
  ];

  const summary = computeSimulationAggregateSummary(snapshot, runs, []);

  it("tallies a must-have won in every run", () => {
    expect(summary.mustHaves).toEqual([{ playerId: "p1", wonRunCount: 3, lostRunCount: 0, unresolvedRunCount: 0 }]);
  });

  it("splits an avoid-listed player's outcome between won-by-self and avoided across runs", () => {
    const p2Aggregate = summary.avoids.find((a) => a.playerId === "p2");
    expect(p2Aggregate).toEqual({ playerId: "p2", wonBySelfRunCount: 1, avoidedRunCount: 2, unresolvedRunCount: 0 });
  });

  it("marks an avoid-listed player that never sold as unresolved in every run", () => {
    const p3Aggregate = summary.avoids.find((a) => a.playerId === "p3");
    expect(p3Aggregate).toEqual({ playerId: "p3", wonBySelfRunCount: 0, avoidedRunCount: 0, unresolvedRunCount: 3 });
  });

  it("computes min <= avg <= max for self's budget remaining across runs", () => {
    // Self's simulated-only spend: run1 = 20, run2 = 25 + 12 = 37, run3 = 30.
    // budgetRemaining starts at 1000 -> 980, 963, 970.
    expect(summary.budgetRemainingRange).toEqual({ min: 963, max: 980, avg: 971 });
  });

  it("reports the correct total run count and team count", () => {
    expect(summary.runCount).toBe(3);
    expect(summary.totalTeams).toBe(3);
  });
});

describe("computeSimulationAggregateSummary — rank with a tie", () => {
  it("skips the next rank after a tie, rather than incrementing by 1 regardless", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    // Self is the weakest of the three (rating 50 -> skillScore 5 -> teamStrength 3);
    // the two rivals tie for first (rating 100 -> skillScore 10 -> teamStrength 6 each).
    // Correct ranking: rivalA=1, rivalB=1 (tied), self=3 (skips 2).
    const pSelf = { id: "pSelf", name: "pSelf", categoryId: "gold", basePrice: 10, rating: 50 };
    const pA = { id: "pA", name: "pA", categoryId: "gold", basePrice: 10, rating: 100 };
    const pB = { id: "pB", name: "pB", categoryId: "gold", basePrice: 10, rating: 100 };

    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 15 },
        { id: "rivalA", name: "RivalA", budgetRemaining: 1000, totalSlots: 15 },
        { id: "rivalB", name: "RivalB", budgetRemaining: 1000, totalSlots: 15 },
      ],
      categories: [category],
      players: [pSelf, pA, pB],
    });

    const runs: SimulationRun[] = [
      {
        seed: 1,
        lots: [
          { playerId: "pSelf", categoryId: "gold", teamId: "self", price: 10, source: "self" },
          { playerId: "pA", categoryId: "gold", teamId: "rivalA", price: 10, source: "contested" },
          { playerId: "pB", categoryId: "gold", teamId: "rivalB", price: 10, source: "contested" },
        ],
      },
    ];

    const summary = computeSimulationAggregateSummary(snapshot, runs, []);
    expect(summary.selfRankRange).toEqual({ min: 3, max: 3, avg: 3 });
  });
});

describe("computeSimulationAggregateSummary — most likely squad", () => {
  const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
  const p1 = { id: "p1", name: "p1", categoryId: "gold", basePrice: 10 };
  const p2 = { id: "p2", name: "p2", categoryId: "gold", basePrice: 10 };
  const p3 = { id: "p3", name: "p3", categoryId: "gold", basePrice: 10 };

  const snapshot = baseSnapshot({
    teams: [
      { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 2 },
      { id: "rival", name: "Rival", budgetRemaining: 1000, totalSlots: 1 },
    ],
    categories: [category],
    players: [p1, p2, p3],
  });

  // Self wins {p1,p2} twice and {p1,p3} once across 3 runs.
  const runs: SimulationRun[] = [
    {
      seed: 1,
      lots: [
        { playerId: "p1", categoryId: "gold", teamId: "self", price: 10, source: "self" },
        { playerId: "p2", categoryId: "gold", teamId: "self", price: 10, source: "self" },
      ],
    },
    {
      seed: 2,
      lots: [
        { playerId: "p1", categoryId: "gold", teamId: "self", price: 10, source: "self" },
        { playerId: "p2", categoryId: "gold", teamId: "self", price: 10, source: "self" },
      ],
    },
    {
      seed: 3,
      lots: [
        { playerId: "p1", categoryId: "gold", teamId: "self", price: 10, source: "self" },
        { playerId: "p3", categoryId: "gold", teamId: "self", price: 10, source: "self" },
      ],
    },
  ];

  const summary = computeSimulationAggregateSummary(snapshot, runs, []);

  it("ranks players by how often each one lands on self's roster, capped to self's own roster size", () => {
    // p1: 3/3, p2: 2/3, p3: 1/3 -- capped to the top totalSlots (2) entries.
    expect(summary.squadFrequencies).toEqual([
      { playerId: "p1", runCount: 3, frequency: 1 },
      { playerId: "p2", runCount: 2, frequency: 2 / 3 },
    ]);
  });

  it("picks the squad combination most other runs overlap with by more than 60%", () => {
    // {p1,p2} (runs 1 and 2) matches only itself twice -- run 3's {p1,p3}
    // is exactly 50% overlap via p1, which no longer qualifies above the
    // 60% threshold, so matchingRunCount is 2, not 3.
    expect(summary.mostFrequentSquad).toEqual({
      playerIds: ["p1", "p2"],
      matchingRunCount: 2,
      sampleRunCount: 3,
    });
  });
});
