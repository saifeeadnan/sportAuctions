import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { expectAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { selectNextPlayer, recordSale, overrideContestedBid } from "@/lib/services/bidding.service";

beforeEach(resetDb);

/**
 * overrideContestedBid is how the auctioneer resolves a "bid:contested"
 * notice — reassigning a lot from whichever team's bid happened to win the
 * optimistic-concurrency race to the team that lost it, at their attempted
 * price. It composes removePlayerFromTeam + adminAssignPlayer as-is, so
 * these tests focus on the composed behavior rather than re-testing either
 * primitive's own rules.
 */
describe("overrideContestedBid", () => {
  it("reassigns a SOLD player to a different team, refunding the original team and debiting the new one", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Override Contested Bid Test Auction",
      teamBudget: 5000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(auction.id, fixture.admin.id);
    await lockPreAuction(auction.id, true, fixture.admin.id);
    await startBidding(auction.id, fixture.admin.id);

    const [entry1, entry2] = await Promise.all(
      fixture.teams.map((t) =>
        prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id, teamId: t.id } })
      )
    );
    const target = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, status: "AVAILABLE" },
    });
    await selectNextPlayer(auction.id, target.id);
    await recordSale(auction.id, target.id, entry1.id, 200, fixture.admin.id);

    const entry1Before = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: entry1.id } });
    const entry2Before = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: entry2.id } });

    const result = await overrideContestedBid(auction.id, target.id, entry2.id, 250, fixture.admin.id);

    expect(result.player.status).toBe("SOLD");
    expect(result.player.soldToEntryId).toBe(entry2.id);
    expect(String(result.player.soldPrice)).toBe("250");
    expect(result.entry.id).toBe(entry2.id);

    const entry1After = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: entry1.id } });
    const entry2After = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: entry2.id } });
    expect(String(entry1After.budgetRemaining)).toBe(String(Number(entry1Before.budgetRemaining) + 200));
    expect(entry1After.slotsFilled).toBe(entry1Before.slotsFilled - 1);
    expect(String(entry2After.budgetRemaining)).toBe(String(Number(entry2Before.budgetRemaining) - 250));
    expect(entry2After.slotsFilled).toBe(entry2Before.slotsFilled + 1);

    await expectAuditLog({
      entityType: "AuctionPlayer",
      entityId: target.id,
      action: "PLAYER_ALLOCATION_REMOVED",
      actorUserId: fixture.admin.id,
    });
    await expectAuditLog({
      entityType: "AuctionPlayer",
      entityId: target.id,
      action: "PLAYER_ASSIGNED_BY_ADMIN",
      actorUserId: fixture.admin.id,
    });
  });

  it("rejects overriding a player that isn't currently SOLD", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Override Contested Bid Reject Test Auction",
      teamBudget: 5000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(auction.id, fixture.admin.id);
    await lockPreAuction(auction.id, true, fixture.admin.id);
    await startBidding(auction.id, fixture.admin.id);

    const entry2 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: fixture.teams[1].id },
    });
    const target = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, status: "AVAILABLE" },
    });

    await expect(overrideContestedBid(auction.id, target.id, entry2.id, 250, fixture.admin.id)).rejects.toThrow(
      /not currently allocated/
    );
  });
});
