import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { selectNextPlayer, placeBid, markUnsold } from "@/lib/services/bidding.service";
import * as broadcaster from "@/server/ws/broadcaster";

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

  it("emits a bid:contested event naming the losing team/amount, and never for an uncontested bid", async () => {
    const emitSpy = vi.spyOn(broadcaster, "emitAuctionEvent");
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A", "Player B"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
    });
    const auction = await createAuction({
      tournamentId: fixture.tournament.id,
      name: "Contested Bid Event Test Auction",
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
    const [target, other] = await prisma.auctionPlayer.findMany({
      where: { auctionId: auction.id, status: "AVAILABLE" },
      orderBy: { player: { name: "asc" } },
    });

    // An uncontested bid on a different player must never emit bid:contested.
    await selectNextPlayer(auction.id, other.id);
    await placeBid(auction.id, other.id, entry1.id, 150);
    expect(emitSpy).not.toHaveBeenCalledWith(expect.anything(), "bid:contested", expect.anything());
    emitSpy.mockClear();
    // Clear the clock so selectNextPlayer can put `target` on it below.
    await markUnsold(auction.id, other.id, fixture.admin.id);

    // Two fresh first bids on target, fired together — same race mechanism
    // as the first test above, just also asserting the emitted event.
    await selectNextPlayer(auction.id, target.id);
    const results = await Promise.allSettled([
      placeBid(auction.id, target.id, entry1.id, 150),
      placeBid(auction.id, target.id, entry2.id, 200),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loserIndex = results.findIndex((r) => r.status === "rejected");
    expect((results[loserIndex] as PromiseRejectedResult).reason.message).toMatch(/Someone else just bid/);
    const loserEntry = [entry1, entry2][loserIndex];
    const loserAmount = [150, 200][loserIndex];

    const contestedCalls = emitSpy.mock.calls.filter(([, event]) => event === "bid:contested");
    expect(contestedCalls).toHaveLength(1);
    const [, , payload] = contestedCalls[0];
    expect(payload).toMatchObject({
      auctionPlayerId: target.id,
      teamAuctionEntryId: loserEntry.id,
      amount: String(loserAmount),
    });
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
    await openPreAuction(auction.id, fixture.admin.id);
    await lockPreAuction(auction.id, true, fixture.admin.id);
    await startBidding(auction.id, fixture.admin.id);

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
