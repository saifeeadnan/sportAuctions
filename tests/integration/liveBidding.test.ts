import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  updateCategoryBidIncrement,
} from "@/lib/services/auction.service";
import { selectNextPlayer, recordSale, markUnsold, placeBid } from "@/lib/services/bidding.service";
import { getAuctionState } from "@/lib/services/auctionState.service";

beforeEach(resetDb);

/** Fixture -> a live BIDDING-status auction with every roster player
 * assigned to a single "Regular" category. Mirrors the setup every ported
 * verify-*.ts live-bidding scenario used. */
async function createLiveAuction(playerNames: string[], teamNames: string[]) {
  const fixture = await createAuctionReadyFixture({ playerNames, teamNames, squadSize: 5 });
  const auction = await createAuction({
    tournamentId: fixture.tournament.id,
    name: "Live Bidding Test Auction",
    teamBudget: 2000,
    createdById: fixture.admin.id,
    categories: [{ name: "Regular", basePrice: 200 }],
    playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true);
  await startBidding(auction.id);
  return { ...fixture, auction };
}

describe("recordSale minimum-price enforcement", () => {
  it("rejects a sale below the category base price and leaves the player on the clock", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1"]);
    const [team1] = await getEntries(auction.id, teams);
    const target = await getAvailablePlayer(auction.id);

    await selectNextPlayer(auction.id, target.id);

    await expect(recordSale(auction.id, target.id, team1.id, 150)).rejects.toThrow(/base price/);

    const stillOnClock = await getPlayerById(target.id);
    expect(stillOnClock.status).toBe("IN_BIDDING");
  });

  it("accepts a sale at exactly the category base price", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1"]);
    const [team1] = await getEntries(auction.id, teams);
    const target = await getAvailablePlayer(auction.id);

    await selectNextPlayer(auction.id, target.id);
    const result = await recordSale(auction.id, target.id, team1.id, 200);

    expect(result.player.status).toBe("SOLD");
    expect(String(result.player.soldPrice)).toBe("200");
  });
});

describe("unsold re-offer", () => {
  it("allows an UNSOLD player back on the clock, and blocks it again once actually SOLD", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1"]);
    const [team1] = await getEntries(auction.id, teams);
    const target = await getAvailablePlayer(auction.id);

    await selectNextPlayer(auction.id, target.id);
    await markUnsold(auction.id, target.id);
    expect((await getPlayerById(target.id)).status).toBe("UNSOLD");

    // Re-offer: UNSOLD -> IN_BIDDING is allowed.
    await selectNextPlayer(auction.id, target.id);
    expect((await getPlayerById(target.id)).status).toBe("IN_BIDDING");

    const result = await recordSale(auction.id, target.id, team1.id, 220);
    expect(result.player.status).toBe("SOLD");
    expect(result.player.soldVia).toBe("LIVE_BID");
    expect(String(result.player.soldPrice)).toBe("220");

    // A third re-offer attempt must fail now that the player is SOLD.
    await expect(selectNextPlayer(auction.id, target.id)).rejects.toThrow(/cannot be put on the clock/);
  });
});

describe("sold player ordering", () => {
  it("keeps soldAt populated so a team's sold column can be sorted most-recent-first", async () => {
    const { auction, teams } = await createLiveAuction(
      ["Player A", "Player B", "Player C"],
      ["Team 1", "Team 2"]
    );
    const [team1, team2] = await getEntries(auction.id, teams);

    await sell(auction.id, "Player A", team1.id, 200);
    await sell(auction.id, "Player B", team2.id, 200);
    await sell(auction.id, "Player C", team1.id, 250);

    const state = await getAuctionState(auction.id);
    const team1Sold = state!.players
      .filter((p) => p.status === "SOLD" && p.soldToEntryId === team1.id)
      .sort((a, b) => (b.soldAt! > a.soldAt! ? 1 : -1));

    expect(team1Sold.map((p) => p.name)).toEqual(["Player C", "Player A"]);
    expect(team1Sold.every((p) => p.soldAt !== null)).toBe(true);
  });
});

describe("recordSale force override", () => {
  it("allows an admin to force a sale below the category base price", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1"]);
    const [team1] = await getEntries(auction.id, teams);
    const target = await getAvailablePlayer(auction.id);

    await selectNextPlayer(auction.id, target.id);
    await expect(recordSale(auction.id, target.id, team1.id, 100)).rejects.toThrow(/base price/);

    const result = await recordSale(auction.id, target.id, team1.id, 100, { force: true });
    expect(result.player.status).toBe("SOLD");
    expect(String(result.player.soldPrice)).toBe("100");
  });

  it("allows an admin to force a sale that would leave the team unable to fill its remaining slots", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1"]);
    const [team1] = await getEntries(auction.id, teams);
    const target = await getAvailablePlayer(auction.id);

    // Fresh team: 1 slot already occupied by the manager's own fee, budget
    // 2000 - 50 manager fee = 1950. Selling at 1500 would leave only 450,
    // short of the 600 (3 remaining slots x 200 reserve unit) required.
    await selectNextPlayer(auction.id, target.id);
    await expect(recordSale(auction.id, target.id, team1.id, 1500)).rejects.toThrow(/must keep at least/);

    const result = await recordSale(auction.id, target.id, team1.id, 1500, { force: true });
    expect(result.player.status).toBe("SOLD");
    expect(String(result.entry.budgetRemaining)).toBe("450");
  });

  it("still refuses a price beyond the team's total remaining budget, even forced", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1"]);
    const [team1] = await getEntries(auction.id, teams);
    const target = await getAvailablePlayer(auction.id);

    await selectNextPlayer(auction.id, target.id);
    await expect(
      recordSale(auction.id, target.id, team1.id, 2500, { force: true })
    ).rejects.toThrow(/does not have enough budget remaining/);
  });

  it("still refuses a sale to a team whose squad is already full, even forced", async () => {
    const { auction, teams } = await createLiveAuction(
      ["Player 1", "Player 2", "Player 3", "Player 4", "Player 5"],
      ["Team 1"]
    );
    const [team1] = await getEntries(auction.id, teams);

    // The manager's own fee already occupies 1 of the team's 5 slots, so 4
    // sales at base price fill the remaining slots exactly.
    for (let i = 0; i < 4; i++) {
      const p = await getAvailablePlayer(auction.id);
      await selectNextPlayer(auction.id, p.id);
      await recordSale(auction.id, p.id, team1.id, 200);
    }

    const last = await getAvailablePlayer(auction.id);
    await selectNextPlayer(auction.id, last.id);
    await expect(
      recordSale(auction.id, last.id, team1.id, 200, { force: true })
    ).rejects.toThrow(/already filled its squad/);
  });
});

describe("bid count in auction state", () => {
  it("reports zero bids for a player just put on the clock, then tracks each bid placed", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1", "Team 2"]);
    const [team1, team2] = await getEntries(auction.id, teams);
    const target = await getAvailablePlayer(auction.id);

    await selectNextPlayer(auction.id, target.id);
    let state = await getAuctionState(auction.id);
    expect(state!.players.find((p) => p.id === target.id)?.bidCount).toBe(0);

    await placeBid(auction.id, target.id, team1.id, 200);
    state = await getAuctionState(auction.id);
    expect(state!.players.find((p) => p.id === target.id)?.bidCount).toBe(1);

    // placeBid sets a 2s cooldown on the player after each bid.
    await new Promise((r) => setTimeout(r, 2100));

    await placeBid(auction.id, target.id, team2.id, 250);
    state = await getAuctionState(auction.id);
    expect(state!.players.find((p) => p.id === target.id)?.bidCount).toBe(2);
  });
});

describe("updateCategoryBidIncrement — locked only while a player is on the clock", () => {
  it("allows editing during live bidding when no player is currently on the clock", async () => {
    const { auction } = await createLiveAuction(["Player A"], ["Team 1"]);
    const category = await prisma.auctionCategory.findFirstOrThrow({ where: { auctionId: auction.id } });

    const updated = await updateCategoryBidIncrement(category.id, 25);
    expect(String(updated.bidIncrement)).toBe("25");
  });

  it("rejects editing while a player is on the clock", async () => {
    const { auction } = await createLiveAuction(["Player A"], ["Team 1"]);
    const category = await prisma.auctionCategory.findFirstOrThrow({ where: { auctionId: auction.id } });
    const target = await getAvailablePlayer(auction.id);
    await selectNextPlayer(auction.id, target.id);

    await expect(updateCategoryBidIncrement(category.id, 25)).rejects.toThrow(/on the clock/);
  });

  it("allows editing again once the on-clock player is sold", async () => {
    const { auction, teams } = await createLiveAuction(["Player A"], ["Team 1"]);
    const [team1] = await getEntries(auction.id, teams);
    const category = await prisma.auctionCategory.findFirstOrThrow({ where: { auctionId: auction.id } });
    const target = await getAvailablePlayer(auction.id);
    await selectNextPlayer(auction.id, target.id);
    await recordSale(auction.id, target.id, team1.id, 200);

    const updated = await updateCategoryBidIncrement(category.id, 25);
    expect(String(updated.bidIncrement)).toBe("25");
  });
});

// --- shared test-local helpers -------------------------------------------

async function sell(auctionId: string, playerName: string, teamEntryId: string, price: number) {
  const ap = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId, player: { name: playerName }, status: "AVAILABLE" },
  });
  await selectNextPlayer(auctionId, ap.id);
  await recordSale(auctionId, ap.id, teamEntryId, price);
  // Ensures distinct soldAt timestamps to sort by, same as the original script.
  await new Promise((r) => setTimeout(r, 5));
}

async function getEntries(auctionId: string, teams: { id: string }[]) {
  return Promise.all(
    teams.map((t) => prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId, teamId: t.id } }))
  );
}

async function getAvailablePlayer(auctionId: string) {
  return prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId, status: "AVAILABLE" } });
}

async function getPlayerById(auctionPlayerId: string) {
  return prisma.auctionPlayer.findUniqueOrThrow({ where: { id: auctionPlayerId } });
}
