import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import { listFantasyEligibilityOverview, submitFantasyTeam } from "@/lib/services/fantasyTeam.service";

beforeEach(resetDb);

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

/** A concluded, single-team auction with one sold player, whose loginId is
 * matched to a separately-created viewer — mirrors buildFantasyEligibleFixture
 * in fantasyTeam.test.ts, trimmed to just what this overview needs. */
async function buildEligibleFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Self Player"],
    teamNames: ["Team 1"],
    squadSize: 2,
  });
  const selfPlayer = fx.players[0];

  const viewerLoginId = `viewer-${Date.now()}`;
  const viewer = await prisma.user.create({
    data: { loginId: viewerLoginId, passwordHash: await bcrypt.hash("password123", 4), name: "Fantasy Viewer" },
  });
  await prisma.player.update({ where: { id: selfPlayer.id }, data: { loginId: viewerLoginId } });

  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Overview Auction",
    teamBudget: 1000,
    createdById: fx.admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });

  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id } });
  const selfAuctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: selfPlayer.id },
  });
  await adminAssignPlayer(auction.id, selfAuctionPlayer.id, team1Entry.id, 100, fx.admin.id);
  await concludeAuction(auction.id, fx.admin.id);
  // isFantasyEditingLocked compares against the tournament's startDate, which
  // createFixtureTournament sets to "now" — push it into the future so
  // submitFantasyTeam's own edit-window check doesn't fire in these tests.
  await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

  return { fx, auction, viewer, selfAuctionPlayer };
}

describe("listFantasyEligibilityOverview", () => {
  it("lists an eligible completed auction as not submitted, then submitted after submitting", async () => {
    const { auction, viewer, selfAuctionPlayer } = await buildEligibleFixture();

    const before = await listFantasyEligibilityOverview(viewer.id, null);
    expect(before).toEqual([
      { auctionId: auction.id, auctionName: auction.name, tournamentName: expect.any(String), submitted: false },
    ]);

    await submitFantasyTeam(auction.id, viewer.id, [selfAuctionPlayer.id], null);

    const after = await listFantasyEligibilityOverview(viewer.id, null);
    expect(after).toEqual([
      { auctionId: auction.id, auctionName: auction.name, tournamentName: expect.any(String), submitted: true },
    ]);
  });

  it("excludes an eligible auction when scoped to a different league", async () => {
    const { fx, viewer } = await buildEligibleFixture();
    const otherLeague = await createAuctionReadyFixture({
      playerNames: ["Other"],
      teamNames: ["Other Team"],
      squadSize: 1,
    });

    const scoped = await listFantasyEligibilityOverview(viewer.id, [otherLeague.league.id]);
    expect(scoped).toEqual([]);

    const unrestricted = await listFantasyEligibilityOverview(viewer.id, null);
    expect(unrestricted).toHaveLength(1);
    // sanity check the fixture actually built something scoped to fx.league
    expect(fx.league.id).not.toBe(otherLeague.league.id);
  });

  it("returns an empty list for a user with no eligible auctions", async () => {
    const fx = await createAuctionReadyFixture({ playerNames: ["P"], teamNames: ["T"], squadSize: 1 });
    expect(await listFantasyEligibilityOverview(fx.admin.id, null)).toEqual([]);
  });
});
