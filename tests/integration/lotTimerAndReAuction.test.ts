import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  resetAuctionToPreBidding,
} from "@/lib/services/auction.service";
import { selectNextPlayer, placeBid, recordSale, markUnsold } from "@/lib/services/bidding.service";
import { getAuctionState } from "@/lib/services/auctionState.service";

beforeEach(resetDb);

async function createLiveAuction(
  playerNames: string[],
  teamNames: string[],
  overrides: {
    lotTimerSeconds?: number;
    reAuctionEnabled?: boolean;
    reAuctionDiscountPercent?: number;
  } = {}
) {
  const fixture = await createAuctionReadyFixture({ playerNames, teamNames, squadSize: 5 });
  const auction = await createAuction({
    tournamentId: fixture.tournament.id,
    name: "Lot Timer & Re-Auction Test Auction",
    teamBudget: 2000,
    createdById: fixture.admin.id,
    categories: [{ name: "Regular", basePrice: 200 }],
    playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    ...overrides,
  });
  await openPreAuction(auction.id, fixture.admin.id);
  await lockPreAuction(auction.id, true, fixture.admin.id);
  await startBidding(auction.id, fixture.admin.id);
  return { ...fixture, auction };
}

async function getPlayer(auctionId: string, playerName: string) {
  return prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId, player: { name: playerName } },
  });
}

describe("lot timer — set/reset mechanics", () => {
  it("selectNextPlayer sets a deadline when the auction has a timer configured", async () => {
    const { auction } = await createLiveAuction(["Player A"], ["Team 1"], { lotTimerSeconds: 20 });
    const ap = await getPlayer(auction.id, "Player A");

    const before = Date.now();
    await selectNextPlayer(auction.id, ap.id);
    const updated = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });

    expect(updated.lotTimerDeadline).not.toBeNull();
    const deadlineMs = updated.lotTimerDeadline!.getTime();
    expect(deadlineMs).toBeGreaterThanOrEqual(before + 19_000);
    expect(deadlineMs).toBeLessThanOrEqual(before + 21_500);
  });

  it("selectNextPlayer leaves the deadline null when no timer is configured", async () => {
    const { auction } = await createLiveAuction(["Player A"], ["Team 1"]);
    const ap = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, ap.id);
    const updated = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });
    expect(updated.lotTimerDeadline).toBeNull();
  });

  it("placeBid resets the deadline to a fresh one on every successful bid", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1", "Team 2"], {
      lotTimerSeconds: 20,
    });
    const ap = await getPlayer(auction.id, "Player A");
    const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });

    await selectNextPlayer(auction.id, ap.id);
    const afterSelect = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });

    await new Promise((r) => setTimeout(r, 20));
    await placeBid(auction.id, ap.id, team1.id, 200);
    const afterBid = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });

    expect(afterBid.lotTimerDeadline).not.toBeNull();
    expect(afterBid.lotTimerDeadline!.getTime()).toBeGreaterThan(afterSelect.lotTimerDeadline!.getTime());
  });

  it("recordSale and markUnsold both clear the deadline", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A", "Player B"], ["Team 1"], {
      lotTimerSeconds: 20,
    });
    const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });

    const apA = await getPlayer(auction.id, "Player A");
    await selectNextPlayer(auction.id, apA.id);
    await recordSale(auction.id, apA.id, team1.id, 200, admin.id);
    const soldA = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apA.id } });
    expect(soldA.lotTimerDeadline).toBeNull();

    const apB = await getPlayer(auction.id, "Player B");
    await selectNextPlayer(auction.id, apB.id);
    await markUnsold(auction.id, apB.id, admin.id);
    const unsoldB = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apB.id } });
    expect(unsoldB.lotTimerDeadline).toBeNull();
  });

  it("resetAuctionToPreBidding clears the deadline in both the LIVE_BID and UNSOLD branches", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A", "Player B"], ["Team 1"], {
      lotTimerSeconds: 20,
    });
    const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });

    const apA = await getPlayer(auction.id, "Player A"); // will be SOLD (LIVE_BID branch)
    await selectNextPlayer(auction.id, apA.id);
    await recordSale(auction.id, apA.id, team1.id, 200, admin.id);

    const apB = await getPlayer(auction.id, "Player B"); // will stay UNSOLD (UNSOLD branch)
    await selectNextPlayer(auction.id, apB.id);
    await markUnsold(auction.id, apB.id, admin.id);

    await resetAuctionToPreBidding(auction.id, admin.id);

    const resetA = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apA.id } });
    const resetB = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apB.id } });
    expect(resetA.lotTimerDeadline).toBeNull();
    expect(resetB.lotTimerDeadline).toBeNull();
  });
});

describe("discounted re-auction — computation", () => {
  it("computes the discount on the first unsold pass and sets the used-flag", async () => {
    const { auction, admin } = await createLiveAuction(["Player A"], ["Team 1"], {
      reAuctionEnabled: true,
      reAuctionDiscountPercent: 25,
    });
    const ap = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id);

    const updated = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });
    // base price 200, 25% off -> 150
    expect(String(updated.discountedBasePrice)).toBe("150");
    expect(updated.reAuctionDiscountUsed).toBe(true);
  });

  it("does not discount further on a second or third unsold pass", async () => {
    const { auction, admin } = await createLiveAuction(["Player A"], ["Team 1"], {
      reAuctionEnabled: true,
      reAuctionDiscountPercent: 25,
    });
    const ap = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id);
    const afterFirst = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id);
    const afterSecond = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id);
    const afterThird = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });

    expect(String(afterFirst.discountedBasePrice)).toBe("150");
    expect(String(afterSecond.discountedBasePrice)).toBe("150");
    expect(String(afterThird.discountedBasePrice)).toBe("150");
  });

  it("does not discount when the auction's re-auction switch is off", async () => {
    const { auction, admin } = await createLiveAuction(["Player A"], ["Team 1"]);
    const ap = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id);

    const updated = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });
    expect(updated.discountedBasePrice).toBeNull();
    expect(updated.reAuctionDiscountUsed).toBe(false);
  });

  it("resetAuctionToPreBidding clears the discount in both the LIVE_BID and UNSOLD branches", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A", "Player B"], ["Team 1"], {
      reAuctionEnabled: true,
      reAuctionDiscountPercent: 25,
    });
    const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });

    // Player A: unsold -> discounted -> re-offered -> SOLD, all within this session.
    const apA = await getPlayer(auction.id, "Player A");
    await selectNextPlayer(auction.id, apA.id);
    await markUnsold(auction.id, apA.id, admin.id);
    await selectNextPlayer(auction.id, apA.id);
    await recordSale(auction.id, apA.id, team1.id, 150, admin.id);

    // Player B: unsold -> discounted, left unsold.
    const apB = await getPlayer(auction.id, "Player B");
    await selectNextPlayer(auction.id, apB.id);
    await markUnsold(auction.id, apB.id, admin.id);

    const beforeResetA = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apA.id } });
    expect(beforeResetA.soldVia).toBe("LIVE_BID");
    const beforeResetB = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apB.id } });
    expect(String(beforeResetB.discountedBasePrice)).toBe("150");

    await resetAuctionToPreBidding(auction.id, admin.id);

    const resetA = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apA.id } });
    const resetB = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: apB.id } });
    expect(resetA.discountedBasePrice).toBeNull();
    expect(resetA.reAuctionDiscountUsed).toBe(false);
    expect(resetB.discountedBasePrice).toBeNull();
    expect(resetB.reAuctionDiscountUsed).toBe(false);
  });
});

describe("discounted re-auction — enforced as the new price floor", () => {
  it("accepts a bid between the discounted floor and the original base price", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A"], ["Team 1"], {
      reAuctionEnabled: true,
      reAuctionDiscountPercent: 25,
    });
    const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });
    const ap = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id); // discounted to 150
    await selectNextPlayer(auction.id, ap.id);

    // 160 sits strictly between the discounted floor (150) and the original
    // base price (200) — only valid if the discounted price is the floor
    // actually being enforced, proving the discount (not the stale original
    // base price) governs the minimum bid.
    await expect(placeBid(auction.id, ap.id, team1.id, 160)).resolves.toBeDefined();
  });

  it("rejects a bid below the discounted floor", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A"], ["Team 1"], {
      reAuctionEnabled: true,
      reAuctionDiscountPercent: 25,
    });
    const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });
    const ap = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id); // discounted to 150
    await selectNextPlayer(auction.id, ap.id);

    await expect(placeBid(auction.id, ap.id, team1.id, 100)).rejects.toThrow(/at least the base price/);
  });
});

describe("getAuctionState — discount is per-player", () => {
  it("surfaces the discounted price only for the affected player, unchanged for its category-mates", async () => {
    const { auction, admin } = await createLiveAuction(["Player A", "Player B"], ["Team 1"], {
      reAuctionEnabled: true,
      reAuctionDiscountPercent: 25,
    });
    const apA = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, apA.id);
    await markUnsold(auction.id, apA.id, admin.id);

    const state = await getAuctionState(auction.id);
    const stateA = state!.players.find((p) => p.name === "Player A")!;
    const stateB = state!.players.find((p) => p.name === "Player B")!;
    expect(stateA.basePrice).toBe("150");
    expect(stateB.basePrice).toBe("200");
  });
});

describe("createAuction — validation", () => {
  it("rejects a non-integer or out-of-range lotTimerSeconds", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const base = {
      tournamentId: fixture.tournament.id,
      name: "Bad Timer Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    };
    await expect(createAuction({ ...base, lotTimerSeconds: 1 })).rejects.toThrow(/between 3 and 600/);
    await expect(createAuction({ ...base, lotTimerSeconds: 1.5 })).rejects.toThrow(/whole number/);
  });

  it("rejects reAuctionEnabled with a missing or out-of-range discount percent", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const base = {
      tournamentId: fixture.tournament.id,
      name: "Bad Discount Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    };
    await expect(createAuction({ ...base, reAuctionEnabled: true })).rejects.toThrow(
      /between 1 and 99/
    );
    await expect(
      createAuction({ ...base, reAuctionEnabled: true, reAuctionDiscountPercent: 0 })
    ).rejects.toThrow(/between 1 and 99/);
    await expect(
      createAuction({ ...base, reAuctionEnabled: true, reAuctionDiscountPercent: 100 })
    ).rejects.toThrow(/between 1 and 99/);
  });

  it("ignores an out-of-range discount percent when re-auction is disabled", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Disabled Discount Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      reAuctionEnabled: false,
      reAuctionDiscountPercent: 500,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    expect(auction.reAuctionEnabled).toBe(false);
    expect(auction.reAuctionDiscountPercent).toBeNull();
  });
});

describe("backward compatibility — both features left off", () => {
  it("an unsold player still re-offers at the exact same, undiscounted price (today's existing behavior)", async () => {
    const { auction, teams, admin } = await createLiveAuction(["Player A"], ["Team 1"]);
    const team1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });
    const ap = await getPlayer(auction.id, "Player A");

    await selectNextPlayer(auction.id, ap.id);
    await markUnsold(auction.id, ap.id, admin.id);

    let refreshed = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });
    expect(refreshed.status).toBe("UNSOLD");
    expect(refreshed.discountedBasePrice).toBeNull();

    await selectNextPlayer(auction.id, ap.id);
    refreshed = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: ap.id } });
    expect(refreshed.status).toBe("IN_BIDDING");

    const result = await recordSale(auction.id, ap.id, team1.id, 200, admin.id);
    expect(result.player.status).toBe("SOLD");
    expect(String(result.player.soldPrice)).toBe("200");

    const state = await getAuctionState(auction.id);
    expect(state!.lotTimerSeconds).toBeNull();
  });
});
