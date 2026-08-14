import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import { submitFantasyTeam } from "@/lib/services/fantasyTeam.service";

beforeEach(resetDb);

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

/**
 * A concluded auction with one team (squadSize 3: the manager occupies one
 * slot, leaving two explicit picks). "Self Player"'s loginId is matched to a
 * separately-created VIEWER account so they're eligible to build a fantasy
 * team for this auction. "Sold Player" is explicitly sold; "Unsold Player"
 * is left unsold, and goes UNSOLD once the auction concludes.
 */
async function buildFantasyEligibleFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Self Player", "Sold Player", "Unsold Player"],
    teamNames: ["Team 1"],
    squadSize: 3,
  });
  const selfPlayer = fx.players.find((p) => p.name === "Self Player")!;
  const soldPlayer = fx.players.find((p) => p.name === "Sold Player")!;
  const unsoldPlayer = fx.players.find((p) => p.name === "Unsold Player")!;

  const viewerLoginId = `viewer-${Date.now()}`;
  const viewer = await prisma.user.create({
    data: {
      loginId: viewerLoginId,
      passwordHash: await bcrypt.hash("password123", 4),
      name: "Fantasy Viewer",
      role: "VIEWER",
      leagueId: fx.league.id,
    },
  });
  await prisma.player.update({ where: { id: selfPlayer.id }, data: { loginId: viewerLoginId } });

  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Auction",
    teamBudget: 1000,
    createdById: fx.admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });

  await openPreAuction(auction.id);
  await lockPreAuction(auction.id, true);
  await startBidding(auction.id);

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id },
  });
  const selfAuctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: selfPlayer.id },
  });
  const soldAuctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: soldPlayer.id },
  });
  const unsoldAuctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: unsoldPlayer.id },
  });

  await adminAssignPlayer(auction.id, selfAuctionPlayer.id, team1Entry.id, 100);
  await adminAssignPlayer(auction.id, soldAuctionPlayer.id, team1Entry.id, 100);
  await concludeAuction(auction.id);

  // isFantasyEditingLocked compares against the tournament's startDate, which
  // the shared createAuctionReadyFixture sets to "now" — push it into the
  // future so submitFantasyTeam's own edit-window check doesn't fire first.
  await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

  return { auction, viewer, soldAuctionPlayer, unsoldAuctionPlayer };
}

describe("submitFantasyTeam rejects unsold players", () => {
  it("accepts a pick that was actually sold", async () => {
    const fx = await buildFantasyEligibleFixture();

    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);

    expect(team.picks.map((p) => p.auctionPlayerId)).toContain(fx.soldAuctionPlayer.id);
  });

  it("rejects a pick that went unsold", async () => {
    const fx = await buildFantasyEligibleFixture();

    await expect(
      submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.unsoldAuctionPlayer.id], null)
    ).rejects.toThrow(/Unsold players/);
  });
});
