import { describe, it, expect } from "vitest";
import { isRunComplete, simulateAuctionRun, simulateAuctionRuns } from "./simulateAuction";
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

describe("simulateAuctionRun", () => {
  it("returns an empty lots array when nothing remains to sell", () => {
    const snapshot = baseSnapshot({
      teams: [{ id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 15 }],
    });

    const run = simulateAuctionRun(snapshot, 1);
    expect(run).toEqual({ seed: 1, lots: [] });
  });

  it("never lets a team with 0 remaining slots win a lot, across many seeds", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `p${i}`, categoryId: "gold", basePrice: 10 }));
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 0 }, // 0 slots: can never win
        { id: "rival", name: "Rival", budgetRemaining: 100000, totalSlots: 15 },
      ],
      categories: [category],
      players,
    });

    for (let seed = 0; seed < 20; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      for (const lot of run.lots) {
        if (!("unsold" in lot)) expect(lot.teamId).not.toBe("self");
      }
    }
  });

  it("resolves every player of a higher base-price category before any player of a lower one", () => {
    // Mirrors the live auctioneer's own "random pick" order
    // (pickFromHighestCategory) — Anchor (100) fully exhausted before any
    // Riser (40), which is fully exhausted before any Regular (15).
    const categories = [
      { id: "anchor", name: "Anchor", basePrice: 100, bidIncrement: null },
      { id: "riser", name: "Riser", basePrice: 40, bidIncrement: null },
      { id: "regular", name: "Regular", basePrice: 15, bidIncrement: null },
    ];
    const players = [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `anchor${i}`, name: `a${i}`, categoryId: "anchor", basePrice: 100 })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `riser${i}`, name: `r${i}`, categoryId: "riser", basePrice: 40 })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `reg${i}`, name: `g${i}`, categoryId: "regular", basePrice: 15 })),
    ];
    const snapshot = baseSnapshot({
      teams: [{ id: "self", name: "Self", budgetRemaining: 100000, totalSlots: 20 }],
      categories,
      players,
    });

    for (let seed = 0; seed < 10; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      const categoryOrder = run.lots.map((l) => l.categoryId);
      const lastAnchorIndex = categoryOrder.lastIndexOf("anchor");
      const firstRiserIndex = categoryOrder.indexOf("riser");
      const lastRiserIndex = categoryOrder.lastIndexOf("riser");
      const firstRegularIndex = categoryOrder.indexOf("regular");
      expect(lastAnchorIndex).toBeLessThan(firstRiserIndex);
      expect(lastRiserIndex).toBeLessThan(firstRegularIndex);
    }
  });

  it("honors every prediction with the same winner in every run, regardless of seed", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = [
      { id: "p1", name: "p1", categoryId: "gold", basePrice: 10 },
      { id: "p2", name: "p2", categoryId: "gold", basePrice: 10 },
    ];
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 15 },
        { id: "rival", name: "Rival", budgetRemaining: 1000, totalSlots: 15 },
      ],
      categories: [category],
      players,
      predictions: [{ playerId: "p1", predictedWinnerTeamId: "rival", predictedAmount: 40, predictedMinAmount: null, predictedUnsold: false }],
    });

    for (let seed = 0; seed < 10; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      const p1Lot = run.lots.find((l) => l.playerId === "p1");
      expect(p1Lot).toMatchObject({ teamId: "rival", price: 40, source: "predicted" });
    }
  });

  it("honors a predicted-unsold guess unconditionally, in every run regardless of seed", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = [{ id: "p1", name: "p1", categoryId: "gold", basePrice: 10 }];
    const snapshot = baseSnapshot({
      // A rival flush with budget and slots who would otherwise certainly
      // buy this player under ordinary competitive resolution — proves the
      // unsold guess overrides that, rather than just happening to win by
      // nobody else bidding.
      teams: [{ id: "rival", name: "Rival", budgetRemaining: 100000, totalSlots: 15 }],
      categories: [category],
      players,
      predictions: [
        { playerId: "p1", predictedWinnerTeamId: null, predictedAmount: null, predictedMinAmount: null, predictedUnsold: true },
      ],
    });

    for (let seed = 0; seed < 10; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      const p1Lot = run.lots.find((l) => l.playerId === "p1");
      expect(p1Lot).toEqual({ playerId: "p1", categoryId: "gold", unsold: true });
    }
  });

  it("treats a price-only prediction (no team) as unpredicted, resolving it competitively instead", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = [{ id: "p1", name: "p1", categoryId: "gold", basePrice: 10 }];
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 0 }, // excluded, never interferes
        { id: "rival", name: "Rival", budgetRemaining: 1000, totalSlots: 1 },
      ],
      categories: [category],
      players,
      // A manager guessed a price but didn't name a team.
      predictions: [{ playerId: "p1", predictedWinnerTeamId: null, predictedAmount: 40, predictedMinAmount: null, predictedUnsold: false }],
    });

    const run = simulateAuctionRun(snapshot, 1);
    const p1Lot = run.lots.find((l) => l.playerId === "p1");
    // Resolved competitively (the only eligible bidder, rival, wins it) —
    // never assigned a "predicted" source, since there was no team to honor.
    expect(p1Lot).toMatchObject({ teamId: "rival", source: "contested" });
  });

  it("honors a price-only prediction as a ceiling on the eventual sale price, across many seeds", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = [{ id: "p1", name: "p1", categoryId: "gold", basePrice: 10 }];
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 0 }, // excluded, never interferes
        { id: "rival", name: "Rival", budgetRemaining: 100000, totalSlots: 15 }, // would otherwise bid far more
      ],
      categories: [category],
      players,
      predictions: [{ playerId: "p1", predictedWinnerTeamId: null, predictedAmount: 40, predictedMinAmount: null, predictedUnsold: false }],
    });

    for (let seed = 0; seed < 20; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      const p1Lot = run.lots.find((l) => l.playerId === "p1");
      if (p1Lot && !("unsold" in p1Lot)) expect(p1Lot.price).toBeLessThanOrEqual(40);
    }
  });

  it("honors a price-only prediction's minimum as a floor on the eventual sale price, across many seeds", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = [{ id: "p1", name: "p1", categoryId: "gold", basePrice: 10 }];
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 0 }, // excluded, never interferes
        { id: "rival", name: "Rival", budgetRemaining: 1000, totalSlots: 15 }, // would often bid near base price
      ],
      categories: [category],
      players,
      predictions: [{ playerId: "p1", predictedWinnerTeamId: null, predictedAmount: null, predictedMinAmount: 30, predictedUnsold: false }],
    });

    for (let seed = 0; seed < 20; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      const p1Lot = run.lots.find((l) => l.playerId === "p1");
      if (p1Lot && !("unsold" in p1Lot)) expect(p1Lot.price).toBeGreaterThanOrEqual(30);
    }
  });

  it("falls back to competitive resolution instead of an illegal sale once the predicted winner's legal room has shrunk below the player's base price", () => {
    const category = { id: "gold", name: "Gold", basePrice: 50, bidIncrement: null };
    const players = [{ id: "p1", name: "p1", categoryId: "gold", basePrice: 50 }];
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 0 }, // excluded, never interferes
        // legalMaxBidEnforced = 40 - 50*0 = 40, below the player's base price
        // of 50 — rival can never legally win this lot.
        { id: "rival", name: "Rival", budgetRemaining: 40, totalSlots: 1 },
      ],
      categories: [category],
      players,
      predictions: [{ playerId: "p1", predictedWinnerTeamId: "rival", predictedAmount: 50, predictedMinAmount: null, predictedUnsold: false }],
    });

    const run = simulateAuctionRun(snapshot, 1);
    // Never a forced sale to rival at a price it can't legally afford.
    expect(run.lots).toEqual([{ playerId: "p1", categoryId: "gold", unsold: true }]);
  });

  it("stops a rival from winning more once it reaches the manager's own 'My estimates' budget for that category", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `p${i}`, categoryId: "gold", basePrice: 10 }));
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 0 }, // excluded, never interferes
        { id: "rivalA", name: "RivalA", budgetRemaining: 100000, totalSlots: 10 },
        { id: "rivalB", name: "RivalB", budgetRemaining: 100000, totalSlots: 10 },
      ],
      categories: [category],
      players,
      // The manager's own belief that rivalA only has 25 left for "gold" —
      // far below rivalA's real budgetRemaining of 100000.
      rivalEstimates: [{ targetTeamId: "rivalA", categoryId: "gold", estimatedBudget: 25 }],
    });

    for (let seed = 0; seed < 20; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      let rivalASpent = 0;
      let rivalAWasOverCap = false;
      for (const lot of run.lots) {
        if ("unsold" in lot) continue;
        if (lot.teamId === "rivalA") {
          expect(rivalAWasOverCap).toBe(false); // must never win again once already over the estimate
          rivalASpent += lot.price;
          if (rivalASpent >= 25) rivalAWasOverCap = true;
        }
      }
    }
  });

  it("does not count pre-existing (retained/traded) category spend against the manager's 'My estimates' cap — only new spend during the run", () => {
    const category = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const retainedPlayer = { id: "retained", name: "retained", categoryId: "gold", basePrice: 10 };
    const openPlayers = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `p${i}`, categoryId: "gold", basePrice: 10 }));
    const snapshot = baseSnapshot({
      teams: [
        { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 0 }, // excluded, never interferes
        { id: "rivalA", name: "RivalA", budgetRemaining: 100000, totalSlots: 10 },
        { id: "rivalB", name: "RivalB", budgetRemaining: 100000, totalSlots: 10 },
      ],
      categories: [category],
      players: [retainedPlayer, ...openPlayers],
      // rivalA already has a retained pick in "gold" worth 500 — far more
      // than the 25 the manager is estimating for gold *going forward*.
      // Under the old (buggy) semantics this pre-existing spend alone would
      // have put rivalA "over cap" before the live auction even started.
      sales: [{ playerId: "retained", teamId: "rivalA", price: 500, timestamp: "t0" }],
      rivalEstimates: [{ targetTeamId: "rivalA", categoryId: "gold", estimatedBudget: 25 }],
    });

    let rivalAEverWon = false;
    for (let seed = 0; seed < 20; seed++) {
      const run = simulateAuctionRun(snapshot, seed);
      let rivalASpentDuringRun = 0;
      let rivalAWasOverCap = false;
      for (const lot of run.lots) {
        if ("unsold" in lot) continue;
        if (lot.teamId === "rivalA") {
          expect(rivalAWasOverCap).toBe(false); // must never win again once already over the estimate
          rivalASpentDuringRun += lot.price;
          rivalAEverWon = true;
          if (rivalASpentDuringRun >= 25) rivalAWasOverCap = true;
        }
      }
    }
    // The pre-existing 500 spend must never have blocked rivalA outright.
    expect(rivalAEverWon).toBe(true);
  });

  it("waterfalls a higher-priority category's unused budget target down into the next category self also targeted", () => {
    const platinum = { id: "platinum", name: "Platinum", basePrice: 150, bidIncrement: null };
    const gold = { id: "gold", name: "Gold", basePrice: 10, bidIncrement: null };
    const players = [
      { id: "p1", name: "p1", categoryId: "platinum", basePrice: 150 },
      { id: "p2", name: "p2", categoryId: "gold", basePrice: 10 },
    ];
    const snapshot = baseSnapshot({
      // Self alone — no rival to contest either lot, so both outcomes are
      // fully deterministic from self's own budget/target math.
      teams: [{ id: "self", name: "Self", budgetRemaining: 100, totalSlots: 1 }],
      categories: [platinum, gold],
      players,
      budgetTargets: [
        { categoryId: "platinum", targetAvgPrice: 500 },
        { categoryId: "gold", targetAvgPrice: 20 },
      ],
    });

    const run = simulateAuctionRun(snapshot, 1);

    // Self's legal max (100, with only 1 slot needed and nothing spent yet)
    // is below Platinum's base price (150), so self can never contest p1 —
    // it's guaranteed to go unsold, leaving self's Platinum spend at 0 and
    // its full 500 target unused.
    const platinumLot = run.lots.find((l) => l.playerId === "p1")!;
    expect(platinumLot).toEqual({ playerId: "p1", categoryId: "platinum", unsold: true });

    // That unused 500 waterfalls onto Gold's own 20 target (520 total),
    // which is now so far above self's legal max (100) that the max itself
    // becomes the binding constraint — self pays its full legal max (100),
    // not the 20 its own standalone Gold target would have capped it at.
    const goldLot = run.lots.find((l) => l.playerId === "p2")!;
    expect(goldLot).toEqual({ playerId: "p2", categoryId: "gold", teamId: "self", price: 100, source: "self" });
  });
});

describe("simulateAuctionRuns", () => {
  it("returns the requested number of runs, each with a distinct seed", () => {
    const snapshot = baseSnapshot({ teams: [{ id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 15 }] });

    const fiveRuns = simulateAuctionRuns(snapshot, 5, 1000);
    expect(fiveRuns).toHaveLength(5);
    expect(new Set(fiveRuns.map((r) => r.seed)).size).toBe(5);

    const hundredRuns = simulateAuctionRuns(snapshot, 100, 1000);
    expect(hundredRuns).toHaveLength(100);
    expect(new Set(hundredRuns.map((r) => r.seed)).size).toBe(100);
  });
});

describe("isRunComplete", () => {
  const snapshot = baseSnapshot({
    teams: [
      { id: "self", name: "Self", budgetRemaining: 1000, totalSlots: 2 },
      { id: "rival", name: "Rival", budgetRemaining: 1000, totalSlots: 1 },
    ],
  });

  it("is true when self's pre-existing sales plus this run's wins add up to self's own roster size", () => {
    const run = {
      seed: 1,
      lots: [
        { playerId: "p1", categoryId: "gold", teamId: "self", price: 10, source: "self" as const },
        { playerId: "p2", categoryId: "gold", unsold: true as const }, // rival still short — doesn't matter
      ],
    };
    expect(isRunComplete({ ...snapshot, sales: [{ playerId: "p0", teamId: "self", price: 10, timestamp: "" }] }, run)).toBe(
      true
    );
  });

  it("is false when self ends short of self's own roster size, even if every rival is full", () => {
    const run = {
      seed: 1,
      lots: [{ playerId: "p1", categoryId: "gold", teamId: "rival", price: 10, source: "contested" as const }],
    };
    expect(isRunComplete(snapshot, run)).toBe(false); // self got 0 of its 2 slots
  });

  it("uses minSquadSize as a lower bar instead of the full roster size when given", () => {
    const run = {
      seed: 1,
      lots: [{ playerId: "p1", categoryId: "gold", teamId: "self", price: 10, source: "self" as const }],
    };
    // self.totalSlots is 2, self only won 1 -> not complete by the default,
    // full-roster bar...
    expect(isRunComplete(snapshot, run)).toBe(false);
    // ...but is complete against an explicit, lower minSquadSize of 1.
    expect(isRunComplete(snapshot, run, 1)).toBe(true);
  });
});
