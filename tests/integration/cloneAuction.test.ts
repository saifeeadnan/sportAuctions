import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { expectAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import { createAuction, cloneAuction, openPreAuction } from "@/lib/services/auction.service";
import { adminAssignPlayer } from "@/lib/services/bidding.service";

beforeEach(resetDb);

async function setup() {
  const fixture = await createAuctionReadyFixture({
    playerNames: ["Player A", "Player B", "Player C"],
    teamNames: ["Team 1", "Team 2"],
    squadSize: 5,
  });
  const source = await createAuction({
    tournamentId: fixture.tournament.id,
    name: "Season Auction",
    teamBudget: 2500,
    createdById: fixture.admin.id,
    skipPreAuctionDraft: true,
    onClockTemplate: "PHOTO_FOCUS",
    onClockVisibleFields: ["photoUrl"],
    lotTimerSeconds: 20,
    reAuctionEnabled: true,
    reAuctionDiscountPercent: 30,
    categories: [
      { name: "Icon", basePrice: 300, preAuctionEligible: false, bidIncrement: 25, maxPerTeam: 2 },
      { name: "Regular", basePrice: 100, preAuctionEligible: false },
    ],
    playerAssignments: fixture.players.map((p, i) => ({
      playerId: p.id,
      categoryName: i === 0 ? "Icon" : "Regular",
    })),
  });
  return { ...fixture, source };
}

describe("cloneAuction", () => {
  it("copies every setting and category into a fresh CREATED auction in the same tournament", async () => {
    const { source, admin, tournament } = await setup();
    await prisma.auction.update({
      where: { id: source.id },
      data: {
        fantasyPricingModel: "CATEGORY_AVERAGE",
        fantasySelfPickRequired: false,
        fantasyMaxTeamsPerUser: 3,
        fantasyManagersAllowed: true,
      },
    });

    const clone = await cloneAuction(source.id, "  Season Auction 2  ", admin.id);

    const saved = await prisma.auction.findUniqueOrThrow({
      where: { id: clone.id },
      include: { categories: { orderBy: { name: "asc" } } },
    });
    expect(saved.id).not.toBe(source.id);
    expect(saved.name).toBe("Season Auction 2");
    expect(saved.tournamentId).toBe(tournament.id);
    expect(saved.status).toBe("CREATED");
    expect(saved.createdById).toBe(admin.id);
    expect(String(saved.teamBudget)).toBe("2500");
    expect(saved.auctionType).toBe(source.auctionType);
    expect(saved.skipPreAuctionDraft).toBe(true);
    expect(saved.onClockTemplate).toBe("PHOTO_FOCUS");
    expect(saved.onClockVisibleFields).toEqual(["photoUrl"]);
    expect(saved.lotTimerSeconds).toBe(20);
    expect(saved.reAuctionEnabled).toBe(true);
    expect(saved.reAuctionDiscountPercent).toBe(30);
    expect(saved.fantasyPricingModel).toBe("CATEGORY_AVERAGE");
    expect(saved.fantasySelfPickRequired).toBe(false);
    expect(saved.fantasyMaxTeamsPerUser).toBe(3);
    expect(saved.fantasyManagersAllowed).toBe(true);

    expect(saved.categories).toHaveLength(2);
    const [icon, regular] = saved.categories;
    expect(icon).toMatchObject({ name: "Icon", preAuctionEligible: false, maxPerTeam: 2 });
    expect(String(icon.basePrice)).toBe("300");
    expect(String(icon.bidIncrement)).toBe("25");
    expect(regular).toMatchObject({ name: "Regular", bidIncrement: null, maxPerTeam: null });
    expect(String(regular.basePrice)).toBe("100");

    const sourceCategoryIds = (await prisma.auctionCategory.findMany({ where: { auctionId: source.id } })).map(
      (c) => c.id
    );
    expect(saved.categories.some((c) => sourceCategoryIds.includes(c.id))).toBe(false);
  });

  it("copies the player pool into the clone's own categories, all AVAILABLE and unassigned", async () => {
    const { source, admin, players } = await setup();
    // The source has moved on: one player sold to a team, one moved to another
    // category, one unsold with a re-auction discount.
    await openPreAuction(source.id, admin.id);
    const entry = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: source.id } });
    const sourceRow = (playerId: string) =>
      prisma.auctionPlayer.findUniqueOrThrow({ where: { auctionId_playerId: { auctionId: source.id, playerId } } });
    await adminAssignPlayer(source.id, (await sourceRow(players[0].id)).id, entry.id, 300, admin.id);
    const sourceIcon = await prisma.auctionCategory.findFirstOrThrow({
      where: { auctionId: source.id, name: "Icon" },
    });
    await prisma.auctionPlayer.update({
      where: { id: (await sourceRow(players[1].id)).id },
      data: { categoryId: sourceIcon.id },
    });
    await prisma.auctionPlayer.update({
      where: { id: (await sourceRow(players[2].id)).id },
      data: { status: "UNSOLD", discountedBasePrice: 70, reAuctionDiscountUsed: true },
    });

    const clone = await cloneAuction(source.id, "Copy", admin.id);

    const cloneRows = await prisma.auctionPlayer.findMany({
      where: { auctionId: clone.id },
      include: { category: true },
    });
    expect(cloneRows.map((r) => r.playerId).sort()).toEqual(players.map((p) => p.id).sort());
    for (const r of cloneRows) {
      expect(r.status).toBe("AVAILABLE");
      expect(r.soldToEntryId).toBeNull();
      expect(r.soldPrice).toBeNull();
      expect(r.soldVia).toBeNull();
      expect(r.soldAt).toBeNull();
      expect(r.currentBidAmount).toBeNull();
      expect(r.discountedBasePrice).toBeNull();
      expect(r.reAuctionDiscountUsed).toBe(false);
      expect(r.category.auctionId).toBe(clone.id);
    }
    // Each player lands in the category the source has them in *now*.
    const categoryOf = new Map(cloneRows.map((r) => [r.playerId, r.category.name]));
    expect(categoryOf.get(players[0].id)).toBe("Icon");
    expect(categoryOf.get(players[1].id)).toBe("Icon");
    expect(categoryOf.get(players[2].id)).toBe("Regular");

    const stillSold = await sourceRow(players[0].id);
    expect(stillSold.status).toBe("SOLD");
    expect(stillSold.soldToEntryId).toBe(entry.id);
    expect(await prisma.auctionPlayer.count({ where: { auctionId: source.id } })).toBe(3);
  });

  it("leaves out everything specific to one run: dates, share token, status and timestamps", async () => {
    const { source, admin } = await setup();
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.auction.update({
      where: { id: source.id },
      data: {
        status: "COMPLETED",
        startedAt: past,
        completedAt: past,
        scheduledStartAt: past,
        fantasyLockDate: past,
        highlightsToken: "source-highlights-token",
      },
    });

    const clone = await cloneAuction(source.id, "Rematch", admin.id);

    const saved = await prisma.auction.findUniqueOrThrow({ where: { id: clone.id } });
    expect(saved.status).toBe("CREATED");
    expect(saved.startedAt).toBeNull();
    expect(saved.completedAt).toBeNull();
    expect(saved.scheduledStartAt).toBeNull();
    expect(saved.fantasyLockDate).toBeNull();
    expect(saved.highlightsToken).toBeNull();

    const stillSource = await prisma.auction.findUniqueOrThrow({ where: { id: source.id } });
    expect(stillSource.status).toBe("COMPLETED");
    expect(stillSource.highlightsToken).toBe("source-highlights-token");
  });

  it("gives the clone the same teams once it's opened, since teams belong to the tournament", async () => {
    const { source, admin, teams } = await setup();
    const clone = await cloneAuction(source.id, "Copy", admin.id);
    expect(await prisma.teamAuctionEntry.count({ where: { auctionId: clone.id } })).toBe(0);

    await openPreAuction(clone.id, admin.id);

    const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: clone.id } });
    expect(entries.map((e) => e.teamId).sort()).toEqual(teams.map((t) => t.id).sort());
    expect(entries.every((e) => e.slotsTotal === 5)).toBe(true);
  });

  it("writes an AUCTION_CLONED audit row pointing back at the source", async () => {
    const { source, admin } = await setup();

    const clone = await cloneAuction(source.id, "Copy", admin.id);

    const log = await expectAuditLog({
      entityType: "Auction",
      entityId: clone.id,
      action: "AUCTION_CLONED",
      actorUserId: admin.id,
    });
    expect(log.after).toMatchObject({
      name: "Copy",
      clonedFromAuctionId: source.id,
      clonedFromName: "Season Auction",
      categoryCount: 2,
      playerCount: 3,
    });
  });

  it("rejects a blank name, an unknown source, and a read-only league, creating nothing", async () => {
    const { source, admin, league } = await setup();
    const auctionsBefore = await prisma.auction.count();

    await expect(cloneAuction(source.id, "   ", admin.id)).rejects.toThrow(/name is required/i);
    await expect(cloneAuction("does-not-exist", "Copy", admin.id)).rejects.toThrow(/not found/i);

    await prisma.league.update({
      where: { id: league.id },
      data: { endDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
    await expect(cloneAuction(source.id, "Copy", admin.id)).rejects.toThrow(/read-only/i);

    expect(await prisma.auction.count()).toBe(auctionsBefore);
  });
});
