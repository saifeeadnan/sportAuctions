import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  startBiddingDirect,
  startBidding,
  resetAuctionToPreBidding,
} from "@/lib/services/auction.service";

beforeEach(resetDb);

async function createSkipConfiguredAuction(
  fixture: Awaited<ReturnType<typeof createAuctionReadyFixture>>,
  overrides: { skipPreAuctionDraft?: boolean; teamBudget?: number } = {}
) {
  return createAuction({
    tournamentId: fixture.tournament.id,
    name: "Skip Pre-Auction Test Auction",
    teamBudget: overrides.teamBudget ?? 2000,
    createdById: fixture.admin.id,
    skipPreAuctionDraft: overrides.skipPreAuctionDraft ?? true,
    categories: [
      { name: "Icon", basePrice: 300 },
      { name: "Regular", basePrice: 100 },
    ],
    playerAssignments: fixture.players.map((p) => ({
      playerId: p.id,
      categoryName: p.name === "Self Match Player" ? "Icon" : "Regular",
    })),
  });
}

describe("startBiddingDirect — happy path", () => {
  it("takes a skip-configured auction straight from CREATED to BIDDING with correct team entries", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Self Match Player", "Other Player 1", "Other Player 2"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
      selfMatch: [{ teamName: "Team 1", playerName: "Self Match Player" }],
    });
    const auction = await createSkipConfiguredAuction(fixture);

    const updated = await startBiddingDirect(auction.id);
    expect(updated.status).toBe("BIDDING");
    expect(updated.startedAt).not.toBeNull();

    const entry1 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: fixture.teams[0].id },
    });
    const entry2 = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: auction.id, teamId: fixture.teams[1].id },
    });

    // Team 1 (self-matched manager): no manager fee, slot not pre-filled,
    // straight to AUCTION_LIVE — mirrors mergedManagerSlot.test.ts's
    // draft-path assertions for the same fixture shape.
    expect(entry1.status).toBe("AUCTION_LIVE");
    expect(entry1.slotsFilled).toBe(0);
    expect(String(entry1.budgetRemaining)).toBe("2000");
    expect(entry1.slotsTotal).toBe(5);

    // Team 2 (not self-matched): the normal manager fee still applies.
    expect(entry2.status).toBe("AUCTION_LIVE");
    expect(entry2.slotsFilled).toBe(1);
    expect(String(entry2.budgetRemaining)).toBe("1950");
  });
});

describe("startBiddingDirect — guards", () => {
  it("rejects when the auction wasn't configured to skip pre-auction", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createSkipConfiguredAuction(fixture, { skipPreAuctionDraft: false });

    await expect(startBiddingDirect(auction.id)).rejects.toThrow(/open pre-auction instead/i);
  });

  it("rejects when status isn't CREATED (already started once)", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createSkipConfiguredAuction(fixture);
    await startBiddingDirect(auction.id);

    await expect(startBiddingDirect(auction.id)).rejects.toThrow(/Cannot start bidding directly/);
  });

  it("throws InsufficientBudgetError when a non-self-matched manager's fee exceeds the team budget", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    // managerBasePrice defaults to 50 in the fixture helper — a budget below
    // that always leaves the entry in deficit for a non-self-matched team.
    const auction = await createSkipConfiguredAuction(fixture, { teamBudget: 10 });

    await expect(startBiddingDirect(auction.id)).rejects.toThrow(/exceeds the auction's team budget/);
  });
});

describe("startBiddingDirect — reset and resume", () => {
  it("reset lands at PRE_AUCTION_LOCKED, and the regular startBidding resumes using the same entry rows", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A", "Player B"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
    });
    const auction = await createSkipConfiguredAuction(fixture);
    await startBiddingDirect(auction.id);

    const entriesBeforeReset = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id } });
    const entryIdsBeforeReset = entriesBeforeReset.map((e) => e.id).sort();

    await resetAuctionToPreBidding(auction.id);

    const resetAuction = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(resetAuction.status).toBe("PRE_AUCTION_LOCKED");
    const entriesAfterReset = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id } });
    expect(entriesAfterReset.every((e) => e.status === "ALLOCATED_PRE_AUCTION")).toBe(true);

    // The *regular* startBidding (not startBiddingDirect) resumes it.
    const resumed = await startBidding(auction.id);
    expect(resumed.status).toBe("BIDDING");

    const entriesAfterResume = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id } });
    expect(entriesAfterResume.every((e) => e.status === "AUCTION_LIVE")).toBe(true);
    // Same rows reused throughout — never recreated.
    expect(entriesAfterResume.map((e) => e.id).sort()).toEqual(entryIdsBeforeReset);
  });
});
