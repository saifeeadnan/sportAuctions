import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture, createFixtureLeague, createFixtureManager } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import {
  submitFantasyTeam,
  getMaxRosterSize,
  updateFantasyLockDate,
  updateFantasySettings,
  getFantasyEligibility,
  listEligibleCompletedAuctionsForViewer,
  listMyFantasyTeams,
  listFantasyPlayerPool,
  getMostPickedPlayersByCategory,
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
async function buildFantasyEligibleFixture(options?: { leaveSelfPlayerUnsold?: boolean }) {
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

  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

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

  if (!options?.leaveSelfPlayerUnsold) {
    await adminAssignPlayer(auction.id, selfAuctionPlayer.id, team1Entry.id, 100, fx.admin.id);
  }
  await adminAssignPlayer(auction.id, soldAuctionPlayer.id, team1Entry.id, 100, fx.admin.id);
  await concludeAuction(auction.id, fx.admin.id);

  // isFantasyEditingLocked compares against the tournament's startDate, which
  // the shared createAuctionReadyFixture sets to "now" — push it into the
  // future so submitFantasyTeam's own edit-window check doesn't fire first.
  await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

  // createAuctionReadyFixture already gives "Team 1" a real manager with a
  // TEAM_MANAGER LeagueMembership in this same league — exactly what the
  // fantasyManagersAllowed tests need, for free.
  const manager = await prisma.user.findUniqueOrThrow({ where: { id: fx.teams[0].managerId! } });

  return {
    auction,
    league: fx.league,
    admin: fx.admin,
    viewer,
    manager,
    selfAuctionPlayer: await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: selfAuctionPlayer.id } }),
    soldAuctionPlayer,
    unsoldAuctionPlayer,
  };
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

  it("updates the name on resubmission when the same fantasyTeamId is passed, keeping the same team row", async () => {
    const fx = await buildFantasyEligibleFixture();

    const first = await submitFantasyTeam(
      fx.auction.id,
      fx.viewer.id,
      [fx.soldAuctionPlayer.id],
      null,
      "Original Name"
    );
    // Omitting fantasyTeamId always means "create a new team" — resubmitting
    // an edit to an existing team must pass its real id explicitly.
    const second = await submitFantasyTeam(
      fx.auction.id,
      fx.viewer.id,
      [fx.soldAuctionPlayer.id],
      null,
      "Renamed",
      first.id
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
    await updateFantasyLockDate(fx.auction.id, PAST, fx.admin.id);

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
    await updateFantasyLockDate(fx.auction.id, FUTURE, fx.admin.id);

    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);
    expect(team.id).toBeTruthy();
  });

  it("clearing the override (null) reverts to the tournament's startDate", async () => {
    const fx = await buildFantasyEligibleFixture();
    const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await updateFantasyLockDate(fx.auction.id, PAST, fx.admin.id);
    await updateFantasyLockDate(fx.auction.id, null, fx.admin.id);

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
      updateFantasyLockDate(fx.auction.id, new Date("not-a-date"), fx.admin.id)
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

    await openPreAuction(auction.id, fx.admin.id);
    await lockPreAuction(auction.id, true, fx.admin.id);
    await startBidding(auction.id, fx.admin.id);

    const [team1Entry, team2Entry] = await prisma.teamAuctionEntry.findMany({
      where: { auctionId: auction.id },
      include: { team: true },
      orderBy: { team: { name: "asc" } },
    });
    const auctionPlayerFor = async (playerId: string) =>
      prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id, playerId } });

    // Team 1: 2 sold (Self Player, P2). Team 2: 3 sold (P3, P4, P5). P6/P7 unsold.
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("Self Player").id)).id, team1Entry.id, 100, fx.admin.id);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P2").id)).id, team1Entry.id, 100, fx.admin.id);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P3").id)).id, team2Entry.id, 100, fx.admin.id);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P4").id)).id, team2Entry.id, 100, fx.admin.id);
    await adminAssignPlayer(auction.id, (await auctionPlayerFor(byName("P5").id)).id, team2Entry.id, 100, fx.admin.id);
    await concludeAuction(auction.id, fx.admin.id);
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

/**
 * A pricing-focused fixture: three categories with genuinely different
 * average prices from any single sold player's own price, so a naive
 * "returned the right number" test can't pass by accident. "Self Player"
 * (Gold, sold @ 300) is matched to `viewer`; "Gold B" (Gold, sold @ 100)
 * makes Gold's average 200 — clearly different from either player's own
 * price. "Silver A" (Silver, sold @ 40) is Silver's only sale, so Silver's
 * average is just 40. "Bronze Solo" (Bronze, left UNSOLD, and the *only*
 * player ever assigned to Bronze) means Bronze has zero SOLD players at
 * all — the fallback-to-basePrice case. When `leaveSelfPlayerUnsold` is
 * set, Self Player is left unassigned too, so Gold's average comes only
 * from Gold B (100), proving an unsold self-pick doesn't count toward its
 * own category's average.
 */
async function buildPricingFixture(options?: { leaveSelfPlayerUnsold?: boolean }) {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Self Player", "Gold B", "Silver A", "Bronze Solo"],
    teamNames: ["Team 1"],
    squadSize: 4,
  });
  const byName = (name: string) => fx.players.find((p) => p.name === name)!;

  const viewerLoginId = `viewer-${Date.now()}-${Math.random()}`;
  const viewer = await prisma.user.create({
    data: {
      loginId: viewerLoginId,
      passwordHash: await bcrypt.hash("password123", 4),
      name: "Fantasy Viewer",
    },
  });
  await prisma.player.update({ where: { id: byName("Self Player").id }, data: { loginId: viewerLoginId } });

  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Auction",
    teamBudget: 10_000,
    createdById: fx.admin.id,
    categories: [
      { name: "Gold", basePrice: 50 },
      { name: "Silver", basePrice: 20 },
      { name: "Bronze", basePrice: 10 },
    ],
    playerAssignments: [
      { playerId: byName("Self Player").id, categoryName: "Gold" },
      { playerId: byName("Gold B").id, categoryName: "Gold" },
      { playerId: byName("Silver A").id, categoryName: "Silver" },
      { playerId: byName("Bronze Solo").id, categoryName: "Bronze" },
    ],
  });

  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id } });
  const auctionPlayerFor = async (playerId: string) =>
    prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: auction.id, playerId } });

  const selfAP = await auctionPlayerFor(byName("Self Player").id);
  const goldBAP = await auctionPlayerFor(byName("Gold B").id);
  const silverAAP = await auctionPlayerFor(byName("Silver A").id);

  if (!options?.leaveSelfPlayerUnsold) {
    await adminAssignPlayer(auction.id, selfAP.id, team1Entry.id, 300, fx.admin.id);
  }
  await adminAssignPlayer(auction.id, goldBAP.id, team1Entry.id, 100, fx.admin.id);
  await adminAssignPlayer(auction.id, silverAAP.id, team1Entry.id, 40, fx.admin.id);
  // "Bronze Solo" is deliberately left unassigned — concludeAuction flips it
  // to UNSOLD, and it's the only player ever in Bronze, so Bronze ends up
  // with zero SOLD players.

  await concludeAuction(auction.id, fx.admin.id);
  await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

  return {
    auction,
    viewer,
    admin: fx.admin,
    selfAP: await auctionPlayerFor(byName("Self Player").id),
    goldBAP: await auctionPlayerFor(byName("Gold B").id),
    silverAAP: await auctionPlayerFor(byName("Silver A").id),
    bronzeSoloAP: await auctionPlayerFor(byName("Bronze Solo").id),
  };
}

describe("fantasy pricing", () => {
  it("self-pick is always priced at the category average, not their own sold price, even under the default SOLD_PRICE model", async () => {
    const fx = await buildPricingFixture();
    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.goldBAP.id], null);

    const selfPick = team.picks.find((p) => p.auctionPlayerId === fx.selfAP.id)!;
    expect(String(selfPick.price)).toBe("200"); // Gold average: (300 + 100) / 2, not Self Player's own 300.
    const goldBPick = team.picks.find((p) => p.auctionPlayerId === fx.goldBAP.id)!;
    expect(String(goldBPick.price)).toBe("100"); // A normal pick still follows SOLD_PRICE by default.
  });

  it("under CATEGORY_AVERAGE pricing, every non-self pick also costs its category average", async () => {
    const fx = await buildPricingFixture();
    await updateFantasySettings(fx.auction.id, { pricingModel: "CATEGORY_AVERAGE" }, fx.admin.id);

    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.goldBAP.id, fx.silverAAP.id], null);
    const goldBPick = team.picks.find((p) => p.auctionPlayerId === fx.goldBAP.id)!;
    expect(String(goldBPick.price)).toBe("200"); // Gold average, not Gold B's own 100.
    const silverAPick = team.picks.find((p) => p.auctionPlayerId === fx.silverAAP.id)!;
    expect(String(silverAPick.price)).toBe("40"); // Silver's only sale.
  });

  it("an unsold self-pick is priced from the category's remaining sales, excluding itself from the average", async () => {
    const fx = await buildPricingFixture({ leaveSelfPlayerUnsold: true });
    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [], null);

    const selfPick = team.picks.find((p) => p.auctionPlayerId === fx.selfAP.id)!;
    expect(String(selfPick.price)).toBe("100"); // Gold average from Gold B alone.
  });

  it("falls back to the category's basePrice when it has zero SOLD players, under either pricing model", async () => {
    const fx = await buildPricingFixture();

    const soldPricePool = await listFantasyPlayerPool(fx.auction.id, "SOLD_PRICE", null);
    expect(soldPricePool.find((p) => p.id === fx.bronzeSoloAP.id)?.price).toBe("10");

    await updateFantasySettings(fx.auction.id, { pricingModel: "CATEGORY_AVERAGE" }, fx.admin.id);
    const categoryAveragePool = await listFantasyPlayerPool(fx.auction.id, "CATEGORY_AVERAGE", null);
    expect(categoryAveragePool.find((p) => p.id === fx.bronzeSoloAP.id)?.price).toBe("10");
  });
});

describe("fantasySelfPickRequired: false", () => {
  async function buildOpenFantasyFixture() {
    const fx = await buildFantasyEligibleFixture();
    await updateFantasySettings(fx.auction.id, { selfPickRequired: false }, fx.admin.id);
    return fx;
  }

  it("getFantasyEligibility treats a user with no self-match in this auction as eligible", async () => {
    const fx = await buildOpenFantasyFixture();
    const outsider = await prisma.user.create({
      data: {
        loginId: `outsider-${Date.now()}-${Math.random()}`,
        passwordHash: await bcrypt.hash("password123", 4),
        name: "Outsider",
      },
    });

    const result = await getFantasyEligibility(fx.auction.id, outsider.id, null);
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.selfAuctionPlayerId).toBeNull();
  });

  it("lets a user with no self-match in this auction submit a team", async () => {
    const fx = await buildOpenFantasyFixture();
    const outsider = await prisma.user.create({
      data: {
        loginId: `outsider-${Date.now()}-${Math.random()}`,
        passwordHash: await bcrypt.hash("password123", 4),
        name: "Outsider",
      },
    });

    const team = await submitFantasyTeam(fx.auction.id, outsider.id, [fx.soldAuctionPlayer.id], null);
    expect(team.picks.map((p) => p.auctionPlayerId)).toEqual([fx.soldAuctionPlayer.id]);
  });

  it("no longer force-includes the self-matched player", async () => {
    const fx = await buildOpenFantasyFixture();
    const team = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);

    expect(team.picks.map((p) => p.auctionPlayerId)).not.toContain(fx.selfAuctionPlayer.id);
    expect(team.picks.map((p) => p.auctionPlayerId)).toEqual([fx.soldAuctionPlayer.id]);
  });

  it("no longer exempts an unsold self-match from the unsold-picks rule", async () => {
    const fx = await buildFantasyEligibleFixture({ leaveSelfPlayerUnsold: true });
    await updateFantasySettings(fx.auction.id, { selfPickRequired: false }, fx.admin.id);

    await expect(
      submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.selfAuctionPlayer.id], null)
    ).rejects.toThrow(/Unsold players/);
  });
});

describe("fantasyMaxTeamsPerUser", () => {
  it("defaults to 1 — a second create-new call is rejected", async () => {
    const fx = await buildFantasyEligibleFixture();
    const first = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);
    expect(first.id).toBeTruthy();

    await expect(
      submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null)
    ).rejects.toThrow(/at most 1 fantasy team/);
  });

  it("raising the cap allows a second team", async () => {
    const fx = await buildFantasyEligibleFixture();
    await updateFantasySettings(fx.auction.id, { maxTeamsPerUser: 2 }, fx.admin.id);

    const first = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null, "Team A");
    const second = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null, "Team B");
    expect(second.id).not.toBe(first.id);

    const myTeams = await listMyFantasyTeams(fx.auction.id, fx.viewer.id);
    expect(myTeams).toHaveLength(2);
  });

  it("editing via an explicit fantasyTeamId is never blocked by the cap, unlike an implicit create", async () => {
    const fx = await buildFantasyEligibleFixture();
    const first = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);

    const edited = await submitFantasyTeam(
      fx.auction.id,
      fx.viewer.id,
      [fx.soldAuctionPlayer.id],
      null,
      "Renamed",
      first.id
    );
    expect(edited.id).toBe(first.id);
    expect(edited.name).toBe("Renamed");
  });

  it("rejects editing a fantasyTeamId that belongs to a different user", async () => {
    const fx = await buildFantasyEligibleFixture();
    const first = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);

    const otherViewer = await prisma.user.create({
      data: {
        loginId: `other-${Date.now()}-${Math.random()}`,
        passwordHash: await bcrypt.hash("password123", 4),
        name: "Other",
      },
    });
    await expect(
      submitFantasyTeam(fx.auction.id, otherViewer.id, [fx.soldAuctionPlayer.id], null, undefined, first.id)
    ).rejects.toThrow(/Fantasy team not found/);
  });

  it("rejects editing a fantasyTeamId that belongs to a different auction", async () => {
    const fx = await buildFantasyEligibleFixture();
    const first = await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null);

    const other = await buildFantasyEligibleFixture();
    await expect(
      submitFantasyTeam(other.auction.id, fx.viewer.id, [], null, undefined, first.id)
    ).rejects.toThrow(/Fantasy team not found/);
  });
});

describe("getMostPickedPlayersByCategory with multiple teams per user", () => {
  it("counts each of one user's teams picking the same player separately, not deduped", async () => {
    const fx = await buildFantasyEligibleFixture();
    await updateFantasySettings(fx.auction.id, { maxTeamsPerUser: 2 }, fx.admin.id);
    await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null, "Team A");
    await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayer.id], null, "Team B");

    const result = await getMostPickedPlayersByCategory(fx.auction.id);
    const regular = result.find((c) => c.categoryName === "Regular")!;
    const soldPlayerEntry = regular.players.find((p) => p.playerId === fx.soldAuctionPlayer.playerId)!;
    expect(soldPlayerEntry.teamCount).toBe(2);
  });
});

describe("fantasyManagersAllowed", () => {
  it("blocks a TEAM_MANAGER's eligibility by default, with a manager-specific reason", async () => {
    const fx = await buildFantasyEligibleFixture();

    const result = await getFantasyEligibility(fx.auction.id, fx.manager.id, null);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/Team managers can't build/);
  });

  it("falls through to the ordinary self-pick check once the setting is turned on", async () => {
    const fx = await buildFantasyEligibleFixture();
    await updateFantasySettings(fx.auction.id, { managersAllowed: true }, fx.admin.id);

    // The manager gate is lifted, but the manager still has no self-match —
    // this now fails for the same reason a self-unmatched viewer would.
    const result = await getFantasyEligibility(fx.auction.id, fx.manager.id, null);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toMatch(/weren't part of this auction's player pool/);
  });

  it("lets an allowed manager submit a team once self-pick isn't required either", async () => {
    const fx = await buildFantasyEligibleFixture();
    await updateFantasySettings(fx.auction.id, { managersAllowed: true, selfPickRequired: false }, fx.admin.id);

    const team = await submitFantasyTeam(fx.auction.id, fx.manager.id, [fx.soldAuctionPlayer.id], null);
    expect(team.picks.map((p) => p.auctionPlayerId)).toEqual([fx.soldAuctionPlayer.id]);
  });

  it("submitFantasyTeam rejects a blocked manager directly, not just the eligibility check", async () => {
    const fx = await buildFantasyEligibleFixture();
    // Isolate the manager gate: turn off self-pick so that's not what
    // rejects this call.
    await updateFantasySettings(fx.auction.id, { selfPickRequired: false }, fx.admin.id);

    await expect(
      submitFantasyTeam(fx.auction.id, fx.manager.id, [fx.soldAuctionPlayer.id], null)
    ).rejects.toThrow(/Team managers can't build/);
  });

  it("doesn't block a TEAM_MANAGER whose managed league is unrelated to this auction's own league", async () => {
    const fx = await buildFantasyEligibleFixture();
    const otherLeague = await createFixtureLeague();
    const otherLeagueManager = await createFixtureManager(otherLeague.id);
    // Self-matched to "Sold Player" in *this* auction's roster — otherwise
    // eligible, so a passing result proves the manager gate didn't leak
    // across leagues, not that some other check happened to also fail.
    await prisma.player.update({
      where: { id: fx.soldAuctionPlayer.playerId },
      data: { loginId: otherLeagueManager.loginId },
    });

    const result = await getFantasyEligibility(fx.auction.id, otherLeagueManager.id, null);
    expect(result.eligible).toBe(true);
  });

  it("excludes a blocked manager's auction from listEligibleCompletedAuctionsForViewer, then includes it once allowed", async () => {
    const fx = await buildFantasyEligibleFixture();
    // Take self-pick out of the equation so only the manager gate is under
    // test here.
    await updateFantasySettings(fx.auction.id, { selfPickRequired: false }, fx.admin.id);

    const before = await listEligibleCompletedAuctionsForViewer(fx.manager.id, null);
    expect(before.map((a) => a.id)).not.toContain(fx.auction.id);

    await updateFantasySettings(fx.auction.id, { managersAllowed: true }, fx.admin.id);
    const after = await listEligibleCompletedAuctionsForViewer(fx.manager.id, null);
    expect(after.map((a) => a.id)).toContain(fx.auction.id);
  });
});
