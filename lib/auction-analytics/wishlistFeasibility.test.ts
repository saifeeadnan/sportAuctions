import { describe, it, expect } from "vitest";
import { computeWishlistFeasibility } from "./wishlistFeasibility";
import type { AnalyticsTeam, AnalyticsPlayer, SaleEvent, WishlistEntry, PlayerValueScore } from "./types";

const ME: AnalyticsTeam = { id: "me", name: "Me", budgetRemaining: 100, totalSlots: 15 };

function player(id: string, basePrice = 5): AnalyticsPlayer {
  return { id, name: id, categoryId: "gold", basePrice };
}

describe("computeWishlistFeasibility", () => {
  it("resolves each must-have to WON, LOST, or AVAILABLE with an estimated price", () => {
    const players = [player("p1"), player("p2"), player("p3")];
    const wishlist: WishlistEntry[] = [
      { playerId: "p1", type: "MUST_HAVE" },
      { playerId: "p2", type: "MUST_HAVE" },
      { playerId: "p3", type: "MUST_HAVE" },
    ];
    const sales: SaleEvent[] = [
      { playerId: "p1", teamId: "me", price: 20, timestamp: "t1" },
      { playerId: "p2", teamId: "rival", price: 15, timestamp: "t2" },
    ];

    const summary = computeWishlistFeasibility(ME, players, sales, wishlist, []);
    const byId = Object.fromEntries(summary.items.map((i) => [i.playerId, i]));

    expect(byId.p1.status).toBe("WON");
    expect(byId.p2.status).toBe("LOST");
    expect(byId.p3.status).toBe("AVAILABLE");
    // p3's estimate comes from the live category average of what's sold so
    // far in "gold": (20 + 15) / 2 = 17.5.
    expect(byId.p3.estimatedPrice).toBe(17.5);
  });

  it("falls back to a player's base price when nothing in its category has sold yet", () => {
    const players = [player("p1", 8)];
    const wishlist: WishlistEntry[] = [{ playerId: "p1", type: "MUST_HAVE" }];

    const summary = computeWishlistFeasibility(ME, players, [], wishlist, []);
    expect(summary.items[0].estimatedPrice).toBe(8);
  });

  it("ignores AVOID entries — only MUST_HAVE feeds the summary", () => {
    const players = [player("p1")];
    const wishlist: WishlistEntry[] = [{ playerId: "p1", type: "AVOID" }];

    const summary = computeWishlistFeasibility(ME, players, [], wishlist, []);
    expect(summary.items).toHaveLength(0);
  });

  it("reports COMFORTABLE when remaining cost is a small fraction of free capacity", () => {
    const players = [player("p1", 10)];
    const wishlist: WishlistEntry[] = [{ playerId: "p1", type: "MUST_HAVE" }];
    // budgetRemaining = 100, estimated cost = 10 -> well under the 70% cutoff.
    const summary = computeWishlistFeasibility(ME, players, [], wishlist, []);
    expect(summary.status).toBe("COMFORTABLE");
  });

  it("reports TIGHT when remaining cost is close to but still within free capacity", () => {
    const players = [player("p1", 75)];
    const wishlist: WishlistEntry[] = [{ playerId: "p1", type: "MUST_HAVE" }];
    // budgetRemaining = 100, estimated cost = 75 -> above the 70 cutoff, within 100.
    const summary = computeWishlistFeasibility(ME, players, [], wishlist, []);
    expect(summary.status).toBe("TIGHT");
  });

  it("reports SHORT when remaining cost exceeds free capacity", () => {
    const players = [player("p1", 150)];
    const wishlist: WishlistEntry[] = [{ playerId: "p1", type: "MUST_HAVE" }];
    const summary = computeWishlistFeasibility(ME, players, [], wishlist, []);
    expect(summary.status).toBe("SHORT");
  });

  it("carries through the value score for each item when provided", () => {
    const players = [player("p1")];
    const wishlist: WishlistEntry[] = [{ playerId: "p1", type: "MUST_HAVE" }];
    const valueScores: PlayerValueScore[] = [
      { playerId: "p1", categoryId: "gold", skillScore: 7, replacementLevel: 4, value: 3 },
    ];
    const summary = computeWishlistFeasibility(ME, players, [], wishlist, valueScores);
    expect(summary.items[0].valueScore).toBe(3);
  });
});
