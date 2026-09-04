import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, addPlayerToAuction, updateAuctionPlayerCategory } from "@/lib/services/auction.service";

beforeEach(resetDb);

/**
 * Regression coverage for the "no way to fix this after auction creation"
 * gaps found this session: AuctionPlayer rows are only ever created once,
 * from a fixed snapshot taken at createAuction time, with no live link back
 * to the roster afterward.
 */
describe("addPlayerToAuction", () => {
  async function setup() {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Already In Pool", "Added Later"],
      teamNames: ["Team 1"],
      squadSize: 2,
    });
    const alreadyInPool = fixture.players.find((p) => p.name === "Already In Pool")!;
    const addedLater = fixture.players.find((p) => p.name === "Added Later")!;

    // Only one of the two roster players is included at auction-creation
    // time — simulating "Added Later" being added to the roster afterward.
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Roster Sync Test Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [
        { name: "Regular", basePrice: 100 },
        { name: "Icon", basePrice: 300 },
      ],
      playerAssignments: [{ playerId: alreadyInPool.id, categoryName: "Regular" }],
    });
    const categories = await prisma.auctionCategory.findMany({ where: { auctionId: auction.id } });
    const regular = categories.find((c) => c.name === "Regular")!;
    const icon = categories.find((c) => c.name === "Icon")!;

    return { ...fixture, auction, addedLater, regular, icon };
  }

  it("joins a roster player who wasn't in the auction's original pool, as Available", async () => {
    const { auction, addedLater, regular, admin } = await setup();

    const created = await addPlayerToAuction(auction.id, addedLater.id, regular.id, admin.id);
    expect(created.status).toBe("AVAILABLE");
    expect(created.playerId).toBe(addedLater.id);
  });

  it("rejects adding the same player twice", async () => {
    const { auction, addedLater, regular, admin } = await setup();
    await addPlayerToAuction(auction.id, addedLater.id, regular.id, admin.id);

    await expect(addPlayerToAuction(auction.id, addedLater.id, regular.id, admin.id)).rejects.toThrow(
      /already in the auction/
    );
  });

  it("rejects a player who doesn't belong to this tournament's roster", async () => {
    const { auction, regular, admin } = await setup();
    const otherFixture = await createAuctionReadyFixture({
      playerNames: ["Outsider"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const outsider = otherFixture.players[0];

    await expect(addPlayerToAuction(auction.id, outsider.id, regular.id, admin.id)).rejects.toThrow(
      /roster/
    );
  });
});

describe("updateAuctionPlayerCategory", () => {
  async function setup() {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Category Change Test Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      categories: [
        { name: "Regular", basePrice: 100 },
        { name: "Icon", basePrice: 300 },
      ],
      playerAssignments: [{ playerId: fixture.players[0].id, categoryName: "Regular" }],
    });
    const categories = await prisma.auctionCategory.findMany({ where: { auctionId: auction.id } });
    const icon = categories.find((c) => c.name === "Icon")!;
    const auctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id } });
    return { ...fixture, auction, icon, auctionPlayer };
  }

  it("moves a not-yet-sold player to a different category of the same auction", async () => {
    const { auctionPlayer, icon, admin } = await setup();

    const updated = await updateAuctionPlayerCategory(auctionPlayer.auctionId, auctionPlayer.id, icon.id, admin.id);
    expect(updated.categoryId).toBe(icon.id);
  });

  it("rejects moving a player once they're on the clock or sold", async () => {
    const { auctionPlayer, icon, admin } = await setup();
    await prisma.auctionPlayer.update({ where: { id: auctionPlayer.id }, data: { status: "IN_BIDDING" } });

    await expect(
      updateAuctionPlayerCategory(auctionPlayer.auctionId, auctionPlayer.id, icon.id, admin.id)
    ).rejects.toThrow(/status is IN_BIDDING/);

    await prisma.auctionPlayer.update({ where: { id: auctionPlayer.id }, data: { status: "SOLD" } });
    await expect(
      updateAuctionPlayerCategory(auctionPlayer.auctionId, auctionPlayer.id, icon.id, admin.id)
    ).rejects.toThrow(/status is SOLD/);
  });

  it("rejects a category that belongs to a different auction", async () => {
    const { auctionPlayer, admin } = await setup();
    const otherFixture = await createAuctionReadyFixture({
      playerNames: ["Other Player"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const otherAuction = await createAuction({
      tournamentId: otherFixture.tournament.id,
      name: "Other Auction",
      teamBudget: 1000,
      createdById: otherFixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: [{ playerId: otherFixture.players[0].id, categoryName: "Regular" }],
    });
    const otherCategory = await prisma.auctionCategory.findFirstOrThrow({
      where: { auctionId: otherAuction.id },
    });

    await expect(
      updateAuctionPlayerCategory(auctionPlayer.auctionId, auctionPlayer.id, otherCategory.id, admin.id)
    ).rejects.toThrow(/does not belong to this auction/);
  });
});
