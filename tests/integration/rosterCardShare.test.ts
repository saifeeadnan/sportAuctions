import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { expectAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import { assignTeamCaptain } from "@/lib/services/teamCaptain.service";
import { uploadTeamSponsorImage } from "@/lib/services/teamSponsorImage.service";
import {
  getOrCreateRosterCardToken,
  getSharedRosterCard,
} from "@/lib/services/rosterCardShare.service";

beforeEach(resetDb);

const PLAYER_NAMES = ["Alpha Player", "Beta Player", "Gamma Player"];

/** A concluded one-category auction where Team 1 won all three players and
 * "Gamma Player" — deliberately last alphabetically — is its captain, so the
 * captain-first ordering is observable rather than coincidental. Team 2
 * wins nothing, covering the empty-roster case. */
async function buildRosterFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: PLAYER_NAMES,
    teamNames: ["Team 1", "Team 2"],
    squadSize: 5,
  });
  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Roster Auction",
    teamBudget: 2000,
    createdById: fx.admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 1" } },
  });
  const team2Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 2" } },
  });
  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId: auction.id },
    include: { player: true },
  });
  const apByName = (name: string) => auctionPlayers.find((ap) => ap.player.name === name)!;

  for (const name of PLAYER_NAMES) {
    await adminAssignPlayer(auction.id, apByName(name).id, team1Entry.id, 100, fx.admin.id);
  }
  await concludeAuction(auction.id, fx.admin.id);
  await assignTeamCaptain(auction.id, team1Entry.id, apByName("Gamma Player").id, fx.admin.id);

  return { fx, auction, adminId: fx.admin.id, team1Entry, team2Entry };
}

describe("getOrCreateRosterCardToken", () => {
  it("rejects creating a link before the auction is completed", async () => {
    const fx = await createAuctionReadyFixture({
      playerNames: ["Player"],
      teamNames: ["Team 1"],
      squadSize: 2,
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
    const entry = await prisma.teamAuctionEntry.findFirstOrThrow({ where: { auctionId: auction.id } });

    await expect(getOrCreateRosterCardToken(entry.id, fx.admin.id)).rejects.toThrow(
      /only be created once the auction has concluded/
    );
    const audits = await prisma.auditLog.count({ where: { action: "ROSTER_CARD_LINK_CREATED" } });
    expect(audits).toBe(0);
  });

  it("rejects an unknown entry", async () => {
    const fx = await createAuctionReadyFixture({ playerNames: ["P"], teamNames: ["T"], squadSize: 1 });
    await expect(getOrCreateRosterCardToken("nope", fx.admin.id)).rejects.toThrow(/not found/);
  });

  it("is idempotent, and audits the creation exactly once without ever recording the token", async () => {
    const { auction, adminId, team1Entry } = await buildRosterFixture();

    const first = await getOrCreateRosterCardToken(team1Entry.id, adminId);
    const second = await getOrCreateRosterCardToken(team1Entry.id, adminId);
    expect(second).toBe(first);
    expect(first.length).toBeGreaterThanOrEqual(32);

    const fromDb = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: team1Entry.id } });
    expect(fromDb.rosterCardToken).toBe(first);

    // Asserted after the SECOND call: exactly one row proves the idempotent
    // path writes nothing.
    const row = await expectAuditLog({
      entityType: "TeamAuctionEntry",
      entityId: team1Entry.id,
      action: "ROSTER_CARD_LINK_CREATED",
      actorUserId: adminId,
    });
    expect(row.auctionId).toBe(auction.id);
    expect(row.note).toBe("Public roster-card link created");
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
    // The token is the access credential to a public page — it must never
    // appear anywhere in the audit row.
    expect(JSON.stringify(row)).not.toContain(first);
  });
});

describe("getSharedRosterCard", () => {
  it("returns null for an unknown token", async () => {
    expect(await getSharedRosterCard("definitely-not-a-token")).toBeNull();
  });

  it("returns the team's identity and its roster with the captain first, then alphabetical, and no prices", async () => {
    const { fx, adminId, team1Entry } = await buildRosterFixture();
    const token = await getOrCreateRosterCardToken(team1Entry.id, adminId);

    const card = await getSharedRosterCard(token);
    expect(card).not.toBeNull();
    expect(card!.teamId).toBe(team1Entry.teamId);
    expect(card!.teamName).toBe("Team 1");
    expect(card!.tournamentId).toBe(fx.tournament.id);
    expect(card!.tournamentName).toBe(fx.tournament.name);
    expect(card!.auctionName).toBe("Roster Auction");
    expect(card!.hasTeamImage).toBe(false);

    expect(card!.players.map((p) => p.playerName)).toEqual([
      "Gamma Player",
      "Alpha Player",
      "Beta Player",
    ]);
    expect(card!.players.map((p) => p.isCaptain)).toEqual([true, false, false]);
    expect(card!.players.every((p) => p.categoryName === "Regular")).toBe(true);
    for (const p of card!.players) {
      expect(p).not.toHaveProperty("price");
      expect(p).not.toHaveProperty("soldPrice");
    }
  });

  it("reports hasTeamImage once a sponsor picture has been uploaded", async () => {
    const { adminId, team1Entry } = await buildRosterFixture();
    const token = await getOrCreateRosterCardToken(team1Entry.id, adminId);

    await uploadTeamSponsorImage(team1Entry.teamId, {
      type: "image/png",
      data: Buffer.from([1, 2, 3]),
    });

    expect((await getSharedRosterCard(token))!.hasTeamImage).toBe(true);
  });

  it("returns an empty roster for a team that won nothing", async () => {
    const { adminId, team2Entry } = await buildRosterFixture();
    const token = await getOrCreateRosterCardToken(team2Entry.id, adminId);

    const card = await getSharedRosterCard(token);
    expect(card!.teamName).toBe("Team 2");
    expect(card!.players).toEqual([]);
  });
});
