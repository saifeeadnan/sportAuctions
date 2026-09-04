import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction } from "@/lib/services/auction.service";
import { adminAssignPlayer } from "@/lib/services/bidding.service";

beforeEach(resetDb);

async function setup() {
  const playerNames = Array.from({ length: 10 }, (_, i) => `Player ${i + 1}`);
  const fixture = await createAuctionReadyFixture({
    playerNames,
    teamNames: ["Team 1", "Team 2"],
    squadSize: 5,
  });
  const auction = await createAuction({
    tournamentId: fixture.tournament.id,
    name: "Admin Assign Test Auction",
    teamBudget: 2000,
    createdById: fixture.admin.id,
    categories: [
      { name: "Icon", basePrice: 300 },
      { name: "Regular", basePrice: 100 },
    ],
    playerAssignments: fixture.players.map((p, i) => ({
      playerId: p.id,
      categoryName: i < 5 ? "Icon" : "Regular",
    })),
  });
  return { ...fixture, auction };
}

describe("adminAssignPlayer", () => {
  it("is rejected before pre-auction has opened", async () => {
    const { auction, admin } = await setup();
    const anyPlayer = await prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id } });

    await expect(
      adminAssignPlayer(auction.id, anyPlayer.id, "nonexistent-entry", 100, admin.id)
    ).rejects.toThrow(/Open pre-auction/);
  });

  it("enforces the category base price, marks the player SOLD via ADMIN_ASSIGNED, and updates budget/slots", async () => {
    const { auction, teams, admin } = await setup();
    await openPreAuction(auction.id, admin.id);

    const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });
    const iconPlayer = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, category: { name: "Icon" } },
    });

    await expect(adminAssignPlayer(auction.id, iconPlayer.id, team1Entry.id, 200, admin.id)).rejects.toThrow(
      /base price/
    );

    const result = await adminAssignPlayer(auction.id, iconPlayer.id, team1Entry.id, 300, admin.id);
    expect(result.player.status).toBe("SOLD");
    expect(result.player.soldVia).toBe("ADMIN_ASSIGNED");
    // 2000 (budget) - 50 (manager fee) - 300 (this assignment) = 1650
    expect(String(result.entry.budgetRemaining)).toBe("1650");
    // manager slot + this assigned player = 2
    expect(result.entry.slotsFilled).toBe(2);
  });

  it("rejects re-assigning a player that's already SOLD, and excludes it from the AVAILABLE pool", async () => {
    const { auction, teams, admin } = await setup();
    await openPreAuction(auction.id, admin.id);

    const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[0].id },
    });
    const team2Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: teams[1].id },
    });
    const iconPlayer = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, category: { name: "Icon" } },
    });

    await adminAssignPlayer(auction.id, iconPlayer.id, team1Entry.id, 300, admin.id);

    await expect(adminAssignPlayer(auction.id, iconPlayer.id, team2Entry.id, 300, admin.id)).rejects.toThrow(
      /cannot be directly assigned/
    );

    const stillAvailable = await prisma.auctionPlayer.findFirst({
      where: { auctionId: auction.id, id: iconPlayer.id, status: "AVAILABLE" },
    });
    expect(stillAvailable).toBeNull();
  });
});
