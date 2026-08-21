import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import {
  submitFantasyTeam,
  getMaxRosterSize,
  updateFantasyLockDate,
} from "@/lib/services/fantasyTeam.service";

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

describe("submitFantasyTeam's optional name", () => {
  it("defaults to null when no name is given", async () => {
    const fx = await buildFantasyEligibleFixture();

    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);

    expect(team.name).toBeNull();
  });

  it("trims and persists a given name", async () => {
    const fx = await buildFantasyEligibleFixture();

    const team = await submitFantasyTeam(
      fx.auction.id,
      fx.viewer.id,
      [fx.soldAuctionPlayer.id],
      null,
      "  The Strikers  "
    );

    expect(team.name).toBe("The Strikers");
  });

  it("normalizes an empty/whitespace-only name to null", async () => {
    const fx = await buildFantasyEligibleFixture();

    const team = await submitFantasyTeam(
      fx.auction.id,
      fx.viewer.id,
      [fx.soldAuctionPlayer.id],
      null,
      "   "
    );

    expect(team.name).toBeNull();
  });

  it("updates the name on resubmission, keeping the same team row", async () => {
    const fx = await buildFantasyEligibleFixture();

    const first = await submitFantasyTeam(
      fx.auction.id,
      fx.viewer.id,
      [fx.soldAuctionPlayer.id],
      null,
      "Original Name"
    );
    const second = await submitFantasyTeam(
      fx.auction.id,
      fx.viewer.id,
      [fx.soldAuctionPlayer.id],
      null,
      "Renamed"
    );

    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Renamed");
  });
});

describe("Auction.fantasyLockDate override", () => {
  it("an override earlier than the tournament's startDate locks submission early", async () => {
    const fx = await buildFantasyEligibleFixture();
    // buildFantasyEligibleFixture already pushed tournament.startDate into
    // FUTURE — without an override, submission would still succeed here.
    const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await updateFantasyLockDate(fx.auction.id, PAST);

    await expect(
      submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null)
    ).rejects.toThrow(/locked and can no longer be changed/);
  });

  it("an override later than the tournament's startDate keeps submission open", async () => {
    const fx = await buildFantasyEligibleFixture();
    const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Flip the tournament's own startDate into the past — without an
    // override this alone would already lock submission.
    await prisma.tournament.update({ where: { id: fx.auction.tournamentId }, data: { startDate: PAST } });
    await updateFantasyLockDate(fx.auction.id, FUTURE);

    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);
    expect(team.id).toBeTruthy();
  });

  it("clearing the override (null) reverts to the tournament's startDate", async () => {
    const fx = await buildFantasyEligibleFixture();
    const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await updateFantasyLockDate(fx.auction.id, PAST);
    await updateFantasyLockDate(fx.auction.id, null);

    // tournament.startDate is still FUTURE (set by the fixture), so clearing
    // the override should un-lock submission again.
    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);
    expect(team.id).toBeTruthy();

    const fromDb = await prisma.auction.findUniqueOrThrow({ where: { id: fx.auction.id } });
    expect(fromDb.fantasyLockDate).toBeNull();
  });

  it("rejects an invalid date", async () => {
    const fx = await buildFantasyEligibleFixture();
    await expect(
      updateFantasyLockDate(fx.auction.id, new Date("not-a-date"))
    ).rejects.toThrow(/Invalid date/);
  });
});

describe("fantasy team cap follows the actual max roster size, not the configured squad size", () => {
  /**
   * squadSize is 5, but no team gets fully staffed — Team 1 ends up with 2
   * sold players (plus its manager's slot), Team 2 with 3 — so the real cap
   * should be 3, not 5. "Self Player" is matched to a viewer for eligibility;
   * two players are left unsold entirely and don't count toward either team.
   */
  async function buildUnevenTeamsFixture() {
    const fx = await createAuctionReadyFixture({
      playerNames: ["Self Player", "P2", "P3", "P4", "P5", "P6", "P7"],
      teamNames: ["Team 1", "Team 2"],
      squadSize: 5,
    });
    const byName = (name: string) => fx.players.find((p) => p.name === name)!;

    const viewerLoginId = `viewer-${Date.now()}`;
    const viewer = await prisma.user.create({
      data: {
        loginId: viewerLoginId,
        passwordHash: await bcrypt.hash("password123", 4),
        name: "Fantasy Viewer",
      },
    });
    await prisma.player.update({
      where: { id: byName("Self Player").id },
      data: { loginId: viewerLoginId },
    });

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

    const [team1Entry, team2Entry] = await prisma.teamAuctionEntry.findMany({
      where: { auctionId: auction.id },
      include: { team: true },
      orderBy: { team: { name: "asc" } },
    });
    const auctionPlayerFor = async (playerId: string) =>
      prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id, playerId } });

    // Team 1: 2 sold (Self Player, P2). Team 2: 3 sold (P3, P4, P5). P6/P7 unsold.
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("Self Player").id)).id, team1Entry.id, 100);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P2").id)).id, team1Entry.id, 100);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P3").id)).id, team2Entry.id, 100);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P4").id)).id, team2Entry.id, 100);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P5").id)).id, team2Entry.id, 100);
    await concludeAuction(auction.id);
    await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

    return {
      auction,
      viewer,
      p3: await auctionPlayerFor(byName("P3").id),
      p4: await auctionPlayerFor(byName("P4").id),
      p5: await auctionPlayerFor(byName("P5").id),
    };
  }

  it("computes the cap as the max actually sold to any one team", async () => {
    const fx = await buildUnevenTeamsFixture();
    expect(await getMaxRosterSize(fx.auction.id)).toBe(3);
  });

  it("accepts a fantasy team at exactly the actual cap", async () => {
    const fx = await buildUnevenTeamsFixture();
    // self (forced) + p3 + p4 = 3, equal to the cap.
    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.p3.id, fx.p4.id], null);
    expect(team.picks).toHaveLength(3);
  });

  it("rejects a fantasy team past the actual cap, even though it's under the configured squad size", async () => {
    const fx = await buildUnevenTeamsFixture();
    // self (forced) + p3 + p4 + p5 = 4, over the actual cap of 3 — well
    // under the tournament's configured squadSize of 5.
    await expect(
      submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.p3.id, fx.p4.id, fx.p5.id], null)
    ).rejects.toThrow(/cannot exceed 3 player/);
  });
});
