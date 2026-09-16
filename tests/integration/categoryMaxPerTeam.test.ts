import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { updateLeagueSettings } from "@/lib/services/league.service";
import {
  createAuction,
  updateCategoryMaxPerTeam,
  openPreAuction,
  lockPreAuction,
  startBidding,
} from "@/lib/services/auction.service";
import {
  adminAssignPlayer,
  placeBid,
  recordSale,
  selectNextPlayer,
  concludeAuction,
  addPlayerPostAuction,
  replacePlayerPostAuction,
} from "@/lib/services/bidding.service";
import { submitDraft } from "@/lib/services/preAuctionDraft.service";
import { expectAuditLog } from "../helpers/auditLog";

beforeEach(resetDb);

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

/** Fixture -> a not-yet-opened auction with two categories: "Icon" (capped
 * at `iconCap`, default 1) and "Regular" (no cap), 4 Icon players + 1
 * Regular player, two teams, squadSize 6 (plenty of headroom past the
 * category cap so slot-cap tests never confound with category-cap tests). */
async function createCappedFixture(iconCap: number | null = 1) {
  const fixture = await createAuctionReadyFixture({
    playerNames: ["Icon 1", "Icon 2", "Icon 3", "Icon 4", "Regular 1"],
    teamNames: ["Team 1", "Team 2"],
    squadSize: 6,
  });
  const byName = (name: string) => fixture.players.find((p) => p.name === name)!;
  const auction = await createAuction({
    tournamentId: fixture.tournament.id,
    name: "Capped Auction",
    teamBudget: 2000,
    createdById: fixture.admin.id,
    categories: [
      { name: "Icon", basePrice: 100, maxPerTeam: iconCap ?? undefined },
      { name: "Regular", basePrice: 50 },
    ],
    playerAssignments: [
      ...["Icon 1", "Icon 2", "Icon 3", "Icon 4"].map((name) => ({
        playerId: byName(name).id,
        categoryName: "Icon",
      })),
      { playerId: byName("Regular 1").id, categoryName: "Regular" },
    ],
  });
  const iconCategory = await prisma.auctionCategory.findFirstOrThrow({
    where: { auctionId: auction.id, name: "Icon" },
  });
  return { ...fixture, auction, iconCategory };
}

async function getEntries(auctionId: string, teams: { id: string }[]) {
  return Promise.all(
    teams.map((t) => prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId, teamId: t.id } }))
  );
}

async function iconPlayer(auctionId: string, name: string) {
  return prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId, player: { name }, status: "AVAILABLE" },
  });
}

describe("createAuction — maxPerTeam validation", () => {
  it("rejects a zero, negative, or non-integer maxPerTeam", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 1,
    });
    const base = {
      tournamentId: fixture.tournament.id,
      name: "Bad Auction",
      teamBudget: 1000,
      createdById: fixture.admin.id,
      playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    };
    for (const bad of [0, -1, 1.5]) {
      await expect(
        createAuction({ ...base, categories: [{ name: "Regular", basePrice: 100, maxPerTeam: bad }] })
      ).rejects.toThrow(/max per team/i);
    }
  });

  it("accepts and stores a valid maxPerTeam, leaving an omitted one null", async () => {
    const { iconCategory, auction } = await createCappedFixture(1);
    expect(iconCategory.maxPerTeam).toBe(1);
    const regular = await prisma.auctionCategory.findFirstOrThrow({
      where: { auctionId: auction.id, name: "Regular" },
    });
    expect(regular.maxPerTeam).toBeNull();
  });
});

describe("updateCategoryMaxPerTeam", () => {
  it("rejects a zero, negative, or non-integer value", async () => {
    const { iconCategory, admin } = await createCappedFixture(1);
    for (const bad of [0, -1, 2.5]) {
      await expect(updateCategoryMaxPerTeam(iconCategory.id, bad, admin.id)).rejects.toThrow(
        /max per team/i
      );
    }
  });

  it("rejects editing once the league is read-only", async () => {
    const { iconCategory, admin, league } = await createCappedFixture(1);
    await updateLeagueSettings(league.id, { endDate: PAST });
    await expect(updateCategoryMaxPerTeam(iconCategory.id, 3, admin.id)).rejects.toThrow(/read-only/i);
  });

  it("rejects lowering the cap below an already-reached count, naming the team, and mutates nothing", async () => {
    const { auction, iconCategory, admin, teams } = await createCappedFixture(3);
    await openPreAuction(auction.id, admin.id);
    await lockPreAuction(auction.id, true, admin.id);
    await startBidding(auction.id, admin.id);
    const [team1] = await getEntries(auction.id, teams);

    const icon1 = await iconPlayer(auction.id, "Icon 1");
    const icon2 = await iconPlayer(auction.id, "Icon 2");
    await adminAssignPlayer(auction.id, icon1.id, team1.id, 100, admin.id);
    await adminAssignPlayer(auction.id, icon2.id, team1.id, 100, admin.id);

    await expect(updateCategoryMaxPerTeam(iconCategory.id, 1, admin.id)).rejects.toThrow(
      /Team 1.*already has 2.*"Icon".*cap of 1/
    );

    const unchanged = await prisma.auctionCategory.findUniqueOrThrow({ where: { id: iconCategory.id } });
    expect(unchanged.maxPerTeam).toBe(3);
  });

  it("succeeds and audits CATEGORY_MAX_PER_TEAM_CHANGED; raising or clearing the cap is always allowed", async () => {
    const { auction, iconCategory, admin, teams } = await createCappedFixture(1);
    await openPreAuction(auction.id, admin.id);
    await lockPreAuction(auction.id, true, admin.id);
    await startBidding(auction.id, admin.id);
    const [team1] = await getEntries(auction.id, teams);
    const icon1 = await iconPlayer(auction.id, "Icon 1");
    const icon2 = await iconPlayer(auction.id, "Icon 2");
    await adminAssignPlayer(auction.id, icon1.id, team1.id, 100, admin.id);
    await adminAssignPlayer(auction.id, icon2.id, team1.id, 100, admin.id); // already 2, over cap 1

    // Raising above an already-over-cap count is fine.
    const raised = await updateCategoryMaxPerTeam(iconCategory.id, 5, admin.id);
    expect(raised.maxPerTeam).toBe(5);
    await expectAuditLog({
      entityType: "AuctionCategory",
      entityId: iconCategory.id,
      action: "CATEGORY_MAX_PER_TEAM_CHANGED",
      actorUserId: admin.id,
    });

    // Clearing it entirely is fine too.
    const cleared = await updateCategoryMaxPerTeam(iconCategory.id, null, admin.id);
    expect(cleared.maxPerTeam).toBeNull();
  });
});

describe("category caps are advisory only — never block any assignment path", () => {
  it("never blocks placeBid, recordSale, or adminAssignPlayer once a team is already over the cap", async () => {
    const { auction, teams, admin } = await createCappedFixture(1);
    await openPreAuction(auction.id, admin.id);
    await lockPreAuction(auction.id, true, admin.id);
    await startBidding(auction.id, admin.id);
    const [team1] = await getEntries(auction.id, teams);

    const icon1 = await iconPlayer(auction.id, "Icon 1");
    await adminAssignPlayer(auction.id, icon1.id, team1.id, 100, admin.id);

    // Team 1 is now at the Icon cap (1/1) — adminAssignPlayer still allows a
    // second Icon player onto the same team.
    const icon2 = await iconPlayer(auction.id, "Icon 2");
    const assigned = await adminAssignPlayer(auction.id, icon2.id, team1.id, 100, admin.id);
    expect(assigned.player.status).toBe("SOLD");

    // Now over cap (2/1) — placeBid and recordSale still work too.
    const icon3 = await iconPlayer(auction.id, "Icon 3");
    await selectNextPlayer(auction.id, icon3.id);
    await expect(placeBid(auction.id, icon3.id, team1.id, 100)).resolves.toBeDefined();
    const sold = await recordSale(auction.id, icon3.id, team1.id, 100, admin.id);
    expect(sold.player.status).toBe("SOLD");

    const count = await prisma.auctionPlayer.count({
      where: { auctionId: auction.id, soldToEntryId: team1.id, category: { name: "Icon" } },
    });
    expect(count).toBe(3);
  });

  it("never blocks addPlayerPostAuction or replacePlayerPostAuction once a team is already over the cap", async () => {
    const { auction, teams, admin, players } = await createCappedFixture(1);
    await openPreAuction(auction.id, admin.id);
    await lockPreAuction(auction.id, true, admin.id);
    await startBidding(auction.id, admin.id);
    const [team1] = await getEntries(auction.id, teams);

    const icon1 = await iconPlayer(auction.id, "Icon 1");
    const icon2 = await iconPlayer(auction.id, "Icon 2");
    await adminAssignPlayer(auction.id, icon1.id, team1.id, 100, admin.id);
    await adminAssignPlayer(auction.id, icon2.id, team1.id, 100, admin.id); // 2/1, already over cap

    await concludeAuction(auction.id, admin.id);

    const iconCat = await prisma.auctionCategory.findFirstOrThrow({
      where: { auctionId: auction.id, name: "Icon" },
    });
    const icon3Player = players.find((p) => p.name === "Icon 3")!;
    const icon4Player = players.find((p) => p.name === "Icon 4")!;

    // Adding a third Icon player to a team already over cap still succeeds.
    const added = await addPlayerPostAuction(auction.id, team1.id, icon3Player.id, iconCat.id, 100, admin.id);
    expect(added.player.status).toBe("SOLD");

    // Swapping in a fourth Icon player (for the first one) still succeeds.
    const outgoing = await prisma.auctionPlayer.findFirstOrThrow({
      where: { auctionId: auction.id, soldToEntryId: team1.id, player: { name: "Icon 1" } },
    });
    const replaced = await replacePlayerPostAuction(
      auction.id,
      outgoing.id,
      icon4Player.id,
      iconCat.id,
      100,
      admin.id
    );
    expect(replaced.incoming.status).toBe("SOLD");

    const count = await prisma.auctionPlayer.count({
      where: { auctionId: auction.id, soldToEntryId: team1.id, category: { name: "Icon" } },
    });
    expect(count).toBe(3); // Icon2, Icon3, Icon4 (Icon1 replaced out)
  });

  it("never blocks submitDraft from selecting more of a capped category than its cap", async () => {
    const { auction, teams, admin } = await createCappedFixture(1);
    await openPreAuction(auction.id, admin.id);
    const [team1] = await getEntries(auction.id, teams);

    const icon1 = await iconPlayer(auction.id, "Icon 1");
    const icon2 = await iconPlayer(auction.id, "Icon 2");

    // Two picks in a category capped at 1 — submitDraft only checks the
    // overall remaining-slots cap, never the per-category one.
    await submitDraft(team1.id, [icon1.id, icon2.id], admin.id);
    const submissionCount = await prisma.preAuctionSubmission.count({
      where: { teamAuctionEntryId: team1.id },
    });
    expect(submissionCount).toBe(2);
  });
});
