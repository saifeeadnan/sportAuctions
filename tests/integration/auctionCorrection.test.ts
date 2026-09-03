import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import { submitFantasyTeam, updateFantasySettings } from "@/lib/services/fantasyTeam.service";
import { updateLeagueSettings } from "@/lib/services/league.service";
import {
  correctSoldPrice,
  correctCategoryBasePrice,
  correctTeamBudget,
} from "@/lib/services/auctionCorrection.service";

beforeEach(resetDb);

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

/**
 * A concluded, two-team auction (teamBudget 1000, squad 3, category base
 * 100, default manager fee 50 per team) with "Self Player" matched to a
 * viewer account for fantasy eligibility. "Self Player" is sold (100, Team
 * 1) unless `leaveSelfPlayerUnsold` is set, in which case it's left for
 * concludeAuction to flip to UNSOLD — needed for the category-correction
 * cascade test, since submitFantasyTeam only ever allows a non-SOLD pick
 * when it's the viewer's own self-match. "Sold Player A" (100, Team 1) and
 * "Sold Player B" (200, Team 2) are always sold, giving Team 1 two sales
 * (for the same-team price-correction tests) and Team 2 one (for the
 * "other teams shift uniformly" assertions).
 */
async function buildCorrectionFixture(options?: { leaveSelfPlayerUnsold?: boolean }) {
  // When Self Player is left unsold, getMaxRosterSize's cap comes from
  // whichever team has the most SOLD players — with only one sold player
  // per team, that cap is 1, too small to also fit the force-included
  // (but unsold) self-pick alongside any other pick in the same fantasy
  // team. A third sale on Team 2 (unrelated to Team 1/the self-pick) raises
  // the cap to 2 without disturbing any of the other tests' budget math.
  const playerNames = ["Self Player", "Sold Player A", "Sold Player B"];
  if (options?.leaveSelfPlayerUnsold) playerNames.push("Sold Player C");
  const fx = await createAuctionReadyFixture({
    playerNames,
    teamNames: ["Team 1", "Team 2"],
    squadSize: 3,
  });
  const selfPlayer = fx.players.find((p) => p.name === "Self Player")!;
  const soldPlayerA = fx.players.find((p) => p.name === "Sold Player A")!;
  const soldPlayerB = fx.players.find((p) => p.name === "Sold Player B")!;

  const viewerLoginId = `viewer-${Date.now()}-${Math.random()}`;
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
    where: { auctionId: auction.id, team: { name: "Team 1" } },
  });
  const team2Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 2" } },
  });

  const selfAuctionPlayer = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: selfPlayer.id },
  });
  const soldAuctionPlayerA = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: soldPlayerA.id },
  });
  const soldAuctionPlayerB = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: soldPlayerB.id },
  });

  if (!options?.leaveSelfPlayerUnsold) {
    await adminAssignPlayer(auction.id, selfAuctionPlayer.id, team1Entry.id, 100);
  } else {
    const soldPlayerC = fx.players.find((p) => p.name === "Sold Player C")!;
    const soldAuctionPlayerC = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, playerId: soldPlayerC.id },
    });
    await adminAssignPlayer(auction.id, soldAuctionPlayerC.id, team2Entry.id, 150);
  }
  await adminAssignPlayer(auction.id, soldAuctionPlayerA.id, team1Entry.id, 100);
  await adminAssignPlayer(auction.id, soldAuctionPlayerB.id, team2Entry.id, 200);

  await concludeAuction(auction.id);

  // Fantasy submission must happen while the edit window is still open —
  // push the deadline into the future for setup, tests push it back into
  // the past themselves when they need to prove the correction cascade
  // works after the real-world deadline has passed.
  await prisma.tournament.update({ where: { id: fx.tournament.id }, data: { startDate: FUTURE } });

  return {
    adminId: fx.admin.id,
    league: fx.league,
    tournamentId: fx.tournament.id,
    auction,
    viewer,
    team1Entry: await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: team1Entry.id } }),
    team2Entry: await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: team2Entry.id } }),
    selfAuctionPlayer,
    soldAuctionPlayerA,
    soldAuctionPlayerB,
  };
}

describe("correctSoldPrice", () => {
  it("applies directly when there's no budget overage, keeping the manager fee intact", async () => {
    const fx = await buildCorrectionFixture();
    // Team 1 budgetRemaining = 1000 - 50 (manager fee) - 100 (Self) - 100 (A) = 750.
    const before = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(before.budgetRemaining)).toBe("750");

    const result = await correctSoldPrice(
      fx.auction.id,
      fx.soldAuctionPlayerA.id,
      300,
      fx.adminId
    );
    expect(result.status).toBe("applied");

    // A naive "teamBudget - sum(soldPrice)" recompute would land on 1000 - 100 -
    // 300 = 600, silently dropping the manager fee. The correct delta-shifted
    // value is 750 - (300 - 100) = 550.
    const after = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(after.budgetRemaining)).toBe("550");

    const player = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: fx.soldAuctionPlayerA.id } });
    expect(String(player.soldPrice)).toBe("300");
  });

  it("cascades the corrected price into an existing fantasy team's snapshot", async () => {
    const fx = await buildCorrectionFixture();
    await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayerA.id], null);

    const before = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerA.id },
    });
    expect(String(before.price)).toBe("100");

    // Prove the cascade works even after the real-world fantasy edit window
    // has closed — that lock only ever gated user-initiated resubmission.
    await prisma.tournament.update({ where: { id: fx.tournamentId }, data: { startDate: PAST } });

    await correctSoldPrice(fx.auction.id, fx.soldAuctionPlayerA.id, 300, fx.adminId);

    const after = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerA.id },
    });
    expect(String(after.price)).toBe("300");
  });

  it("returns needs_confirmation with zero writes when the correction would put the team into deficit", async () => {
    const fx = await buildCorrectionFixture();

    const result = await correctSoldPrice(fx.auction.id, fx.soldAuctionPlayerA.id, 900, fx.adminId);
    expect(result.status).toBe("needs_confirmation");
    if (result.status !== "needs_confirmation") throw new Error("unreachable");
    expect(result.teamName).toBe("Team 1");
    expect(result.currentBudget).toBe("1000");
    // budgetRemaining 750 - (900-100) = -50 deficit -> suggested = 1000 + 50 = 1050.
    expect(result.suggestedBudget).toBe("1050");

    const player = await prisma.auctionPlayer.findUniqueOrThrow({ where: { id: fx.soldAuctionPlayerA.id } });
    expect(String(player.soldPrice)).toBe("100");
    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(entry.budgetRemaining)).toBe("750");
    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: fx.auction.id } });
    expect(String(auction.teamBudget)).toBe("1000");
    expect(await prisma.auctionCorrectionLog.count()).toBe(0);
  });

  it("applies fully when a sufficient confirmed budget is given, shifting every team uniformly", async () => {
    const fx = await buildCorrectionFixture();
    await prisma.tournament.update({ where: { id: fx.tournamentId }, data: { startDate: PAST } });

    const result = await correctSoldPrice(fx.auction.id, fx.soldAuctionPlayerA.id, 900, fx.adminId, 1050);
    expect(result.status).toBe("applied");

    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: fx.auction.id } });
    expect(String(auction.teamBudget)).toBe("1050");

    // Team 1: 750 (budgetDelta 50) - (900-100) priceDelta = 750 + 50 - 800 = 0.
    const team1 = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(team1.budgetRemaining)).toBe("0");

    // Team 2: untouched by the price change, only the uniform +50 budget delta.
    const team2 = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team2Entry.id } });
    expect(String(team2.budgetRemaining)).toBe("800");

    const logs = await prisma.auctionCorrectionLog.findMany({ where: { auctionId: fx.auction.id } });
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.correctionType).sort()).toEqual(["SOLD_PRICE", "TEAM_BUDGET"]);
  });

  it("rejects a still-insufficient confirmed budget", async () => {
    const fx = await buildCorrectionFixture();

    await expect(
      correctSoldPrice(fx.auction.id, fx.soldAuctionPlayerA.id, 900, fx.adminId, 1000)
    ).rejects.toThrow(/still isn't enough/);

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(entry.budgetRemaining)).toBe("750");
    expect(await prisma.auctionCorrectionLog.count()).toBe(0);
  });

  it("rejects correcting a player that isn't SOLD", async () => {
    const fx = await buildCorrectionFixture({ leaveSelfPlayerUnsold: true });
    await expect(
      correctSoldPrice(fx.auction.id, fx.selfAuctionPlayer.id, 100, fx.adminId)
    ).rejects.toThrow(/Cannot correct a sold price/);
  });

  it("rejects a correction on a non-COMPLETED auction", async () => {
    const fx = await createAuctionReadyFixture({
      playerNames: ["Player"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const auction = await createAuction({
      tournamentId: fx.tournament.id,
      name: "Auction",
      teamBudget: 1000,
      createdById: fx.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await expect(
      correctSoldPrice(auction.id, "does-not-matter", 100, fx.admin.id)
    ).rejects.toThrow(/only available once the auction has concluded/);
  });
});

describe("correctCategoryBasePrice", () => {
  it("never touches budgetRemaining or a SOLD player's price, and leaves an unsold self-pick's category-average price alone since it isn't derived from basePrice", async () => {
    const fx = await buildCorrectionFixture({ leaveSelfPlayerUnsold: true });
    // Self Player is unsold, so it's the only way it can appear on a fantasy
    // team (submitFantasyTeam force-includes the self-pick regardless of
    // status, but rejects any other non-SOLD pick).
    await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayerA.id], null);

    const category = await prisma.auctionCategory.findFirstOrThrow({ where: { auctionId: fx.auction.id } });
    const team1Before = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });

    // "Regular" already has SOLD players (A@100, B@200, C@150), so the
    // self-pick — always priced at the category average of SOLD prices,
    // even while unsold — is 150 here, not the category's basePrice.
    const selfBefore = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.selfAuctionPlayer.id },
    });
    expect(String(selfBefore.price)).toBe("150");

    await prisma.tournament.update({ where: { id: fx.tournamentId }, data: { startDate: PAST } });
    await correctCategoryBasePrice(fx.auction.id, category.id, 250, fx.adminId);

    // basePrice changed, but the self-pick's price is derived from SOLD
    // prices, not basePrice, so it's unaffected by this correction.
    const selfFantasyPick = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.selfAuctionPlayer.id },
    });
    expect(String(selfFantasyPick.price)).toBe("150");

    const soldFantasyPick = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerA.id },
    });
    expect(String(soldFantasyPick.price)).toBe("100");

    const team1After = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(team1After.budgetRemaining)).toBe(String(team1Before.budgetRemaining));

    const updatedCategory = await prisma.auctionCategory.findUniqueOrThrow({ where: { id: category.id } });
    expect(String(updatedCategory.basePrice)).toBe("250");
  });
});

describe("correctTeamBudget", () => {
  it("recomputes every team's budgetRemaining by a uniform delta", async () => {
    const fx = await buildCorrectionFixture();

    await correctTeamBudget(fx.auction.id, 1200, fx.adminId);

    const team1 = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(String(team1.budgetRemaining)).toBe("950"); // 750 + 200
    const team2 = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team2Entry.id } });
    expect(String(team2.budgetRemaining)).toBe("950"); // 750 + 200

    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: fx.auction.id } });
    expect(String(auction.teamBudget)).toBe("1200");

    const log = await prisma.auctionCorrectionLog.findFirstOrThrow({ where: { auctionId: fx.auction.id } });
    expect(log.correctionType).toBe("TEAM_BUDGET");
  });

  it("rejects a decrease that would put a team into deficit", async () => {
    const fx = await buildCorrectionFixture();
    // Both teams sit at budgetRemaining 750; a new budget below 250 pushes
    // 750 + (newBudget - 1000) negative for either of them.
    await expect(correctTeamBudget(fx.auction.id, 200, fx.adminId)).rejects.toThrow(/Team 1/);

    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: fx.auction.id } });
    expect(String(auction.teamBudget)).toBe("1000");
    expect(await prisma.auctionCorrectionLog.count()).toBe(0);
  });

  it("rejects a correction on a non-COMPLETED auction", async () => {
    const fx = await createAuctionReadyFixture({
      playerNames: ["Player"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const auction = await createAuction({
      tournamentId: fx.tournament.id,
      name: "Auction",
      teamBudget: 1000,
      createdById: fx.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await expect(correctTeamBudget(auction.id, 2000, fx.admin.id)).rejects.toThrow(
      /only available once the auction has concluded/
    );
  });
});

describe("fantasy pricing cascade", () => {
  it("a sold-price correction under CATEGORY_AVERAGE mode cascades to every fantasy pick in that category, not just the corrected player's own", async () => {
    const fx = await buildCorrectionFixture();
    await updateFantasySettings(fx.auction.id, { pricingModel: "CATEGORY_AVERAGE" });
    // Self forced-included (100) + Sold Player B (200) picked directly.
    await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayerB.id], null);

    // Category average across Self(100)/A(100)/B(200) = 400/3 = 133.33 — B's
    // own pick is priced off the category, not its own sold price.
    const before = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerB.id },
    });
    expect(String(before.price)).toBe("133.33");

    await prisma.tournament.update({ where: { id: fx.tournamentId }, data: { startDate: PAST } });
    // Correcting A (unrelated to B, and not on this fantasy team at all)
    // still moves the shared category average, so B's stored price must
    // shift too: (100 self + 400 A + 200 B) / 3 = 233.33.
    await correctSoldPrice(fx.auction.id, fx.soldAuctionPlayerA.id, 400, fx.adminId);

    const after = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerB.id },
    });
    expect(String(after.price)).toBe("233.33");
  });

  it("never overwrites a self-pick's price with a corrected sold price — self-picks always reprice to the category average instead", async () => {
    const fx = await buildCorrectionFixture();
    await submitFantasyTeam(fx.auction.id, fx.viewer.id, [], null);

    // Default SOLD_PRICE mode, but the self-pick is always category-average
    // priced regardless: (100 self + 100 A + 200 B) / 3 = 133.33.
    const before = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.selfAuctionPlayer.id },
    });
    expect(String(before.price)).toBe("133.33");

    await prisma.tournament.update({ where: { id: fx.tournamentId }, data: { startDate: PAST } });
    await correctSoldPrice(fx.auction.id, fx.selfAuctionPlayer.id, 500, fx.adminId);

    // A narrow "set this player's picks to the new sold price" update would
    // have landed here at 500. Repricing correctly reads the post-correction
    // value within the same transaction and recomputes the average instead:
    // (500 self + 100 A + 200 B) / 3 = 266.67.
    const after = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.selfAuctionPlayer.id },
    });
    expect(String(after.price)).toBe("266.67");
  });
});

describe("updateFantasySettings", () => {
  it("reprices every existing FantasyTeamPlayer.price when the pricing model changes, in both directions", async () => {
    const fx = await buildCorrectionFixture();
    await submitFantasyTeam(fx.auction.id, fx.viewer.id, [fx.soldAuctionPlayerA.id], null);

    const soldModePick = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerA.id },
    });
    expect(String(soldModePick.price)).toBe("100");

    await updateFantasySettings(fx.auction.id, { pricingModel: "CATEGORY_AVERAGE" });
    const avgModePick = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerA.id },
    });
    // (100 self + 100 A + 200 B) / 3 = 133.33
    expect(String(avgModePick.price)).toBe("133.33");

    await updateFantasySettings(fx.auction.id, { pricingModel: "SOLD_PRICE" });
    const backToSoldPick = await prisma.fantasyTeamPlayer.findFirstOrThrow({
      where: { auctionPlayerId: fx.soldAuctionPlayerA.id },
    });
    expect(String(backToSoldPick.price)).toBe("100");
  });

  it("is blocked once the league is read-only", async () => {
    const fx = await buildCorrectionFixture();
    await updateLeagueSettings(fx.league.id, { endDate: PAST });

    await expect(
      updateFantasySettings(fx.auction.id, { pricingModel: "CATEGORY_AVERAGE" })
    ).rejects.toThrow(/read-only/);
  });
});
