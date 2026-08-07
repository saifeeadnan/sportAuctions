import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { selectNextPlayer, placeBid } from "@/lib/services/bidding.service";

beforeEach(resetDb);

/**
 * placeBid's optimistic compare-and-swap (an updateMany guarded by the exact
 * currentBidAmount read at the start of the call) is what closes the race
 * two managers clicking bid at the same instant would otherwise open —
 * without it, both requests could read "no current bid", and both could
 * believe they'd won. This exercises that guarantee under real concurrent
 * database access, not the one-request-at-a-time testing this has only
 * ever gotten manually.
 */
describe("placeBid concurrency", () => {
  it("lets exactly one of two simultaneous first bids win, and records only one Bid row", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Concurrency Test Auction",
      teamBudget: 5000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(auction.id);
    await lockPreAuction(auction.id, true);
    await startBidding(auction.id);

    const [entry1, entry2] = await Promise.all(
      fixture.teams.map((t) =>
        prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id, teamId: t.id } })
      )
    );
    const target = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, status: "AVAILABLE" },
    });
    await selectNextPlayer(auction.id, target.id);

    // Fired together, neither awaited before the other starts — both read
    // "no current bid" at roughly the same time.
    const results = await Promise.allSettled([
      placeBid(auction.id, target.id, entry1.id, 150),
      placeBid(auction.id, target.id, entry2.id, 200),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/Someone else just bid/);

    const finalPlayer = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: target.id } });
    expect(finalPlayer.currentBidderEntryId).not.toBeNull();
    // The final state must reflect exactly the winner's own bid, whichever it was.
    expect([entry1.id, entry2.id]).toContain(finalPlayer.currentBidderEntryId);
    expect(["150", "200"]).toContain(String(finalPlayer.currentBidAmount));

    const bidRows = await prisma.bid.findMany({ where: { auctionPlayerId: target.id } });
    expect(bidRows).toHaveLength(1);
    expect(String(bidRows[0].amount)).toBe(String(finalPlayer.currentBidAmount));
  });

  it("never lets a team out-raise its own standing bid, even racing against itself", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Self Outbid Test Auction",
      teamBudget: 5000,
      createdById: fixture.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(auction.id);
    await lockPreAuction(auction.id, true);
    await startBidding(auction.id);

    const entry1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: fixture.teams[0].id },
    });
    const target = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, status: "AVAILABLE" },
    });
    await selectNextPlayer(auction.id, target.id);

    await placeBid(auction.id, target.id, entry1.id, 150);
    await expect(placeBid(auction.id, target.id, entry1.id, 200)).rejects.toThrow(
      /already hold the highest bid/
    );
  });
});
