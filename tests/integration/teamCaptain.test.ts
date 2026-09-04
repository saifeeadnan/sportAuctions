import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";
import { updateLeagueSettings } from "@/lib/services/league.service";
import { assignTeamCaptain } from "@/lib/services/teamCaptain.service";
import { getAuctionState } from "@/lib/services/auctionState.service";

beforeEach(resetDb);

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

/**
 * A concluded, two-team auction: Team 1 wins "Player A" and "Player B",
 * Team 2 wins "Player C" — enough to test both "assign within your own
 * roster" and "reject a player won by a different team."
 */
async function buildCaptainFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Player A", "Player B", "Player C"],
    teamNames: ["Team 1", "Team 2"],
    squadSize: 3,
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

  const team1Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 1" } },
  });
  const team2Entry = await prisma.teamAuctionEntry.findFirstOrThrow({
    where: { auctionId: auction.id, team: { name: "Team 2" } },
  });

  const playerA = fx.players.find((p) => p.name === "Player A")!;
  const playerB = fx.players.find((p) => p.name === "Player B")!;
  const playerC = fx.players.find((p) => p.name === "Player C")!;

  const apA = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: playerA.id },
  });
  const apB = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: playerB.id },
  });
  const apC = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: playerC.id },
  });

  await adminAssignPlayer(auction.id, apA.id, team1Entry.id, 100, fx.admin.id);
  await adminAssignPlayer(auction.id, apB.id, team1Entry.id, 100, fx.admin.id);
  await adminAssignPlayer(auction.id, apC.id, team2Entry.id, 100, fx.admin.id);

  await concludeAuction(auction.id, fx.admin.id);

  return {
    league: fx.league,
    admin: fx.admin,
    auction,
    team1Entry: await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: team1Entry.id } }),
    team2Entry: await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: team2Entry.id } }),
    apA,
    apB,
    apC,
  };
}

describe("assignTeamCaptain", () => {
  it("assigns a captain from among the players this team actually won", async () => {
    const fx = await buildCaptainFixture();
    await assignTeamCaptain(fx.auction.id, fx.team1Entry.id, fx.apA.id, fx.admin.id);

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(entry.captainAuctionPlayerId).toBe(fx.apA.id);
  });

  it("rejects a player won by a different team in the same auction", async () => {
    const fx = await buildCaptainFixture();
    await expect(
      assignTeamCaptain(fx.auction.id, fx.team1Entry.id, fx.apC.id, fx.admin.id)
    ).rejects.toThrow(/not won by this team/);
  });

  it("rejects an auction player id from a different auction entirely", async () => {
    const fx = await buildCaptainFixture();
    const other = await createAuctionReadyFixture({
      playerNames: ["Other Player"],
      teamNames: ["Other Team"],
      squadSize: 1,
    });
    const otherAuction = await createAuction({
      tournamentId: other.tournament.id,
      name: "Other Auction",
      teamBudget: 1000,
      createdById: other.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: other.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    const otherAp = await prisma.auctionPlayer.findFirstOrThrow({ where: { auctionId: otherAuction.id } });

    await expect(
      assignTeamCaptain(fx.auction.id, fx.team1Entry.id, otherAp.id, fx.admin.id)
    ).rejects.toThrow(/Player not found in this auction/);
  });

  it("rejects a teamAuctionEntryId from a different auction entirely", async () => {
    const fx = await buildCaptainFixture();
    const other = await createAuctionReadyFixture({
      playerNames: ["Other Player"],
      teamNames: ["Other Team"],
      squadSize: 1,
    });
    const otherAuction = await createAuction({
      tournamentId: other.tournament.id,
      name: "Other Auction",
      teamBudget: 1000,
      createdById: other.admin.id,
      categories: [{ name: "Regular", basePrice: 100 }],
      playerAssignments: other.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
    });
    await openPreAuction(otherAuction.id, other.admin.id);
    await lockPreAuction(otherAuction.id, true, other.admin.id);
    await startBidding(otherAuction.id, other.admin.id);
    const otherEntry = await prisma.teamAuctionEntry.findFirstOrThrow({
      where: { auctionId: otherAuction.id },
    });

    await expect(
      assignTeamCaptain(fx.auction.id, otherEntry.id, fx.apA.id, fx.admin.id)
    ).rejects.toThrow(/Team entry not found in this auction/);
  });

  it("rejects assignment before the auction is COMPLETED", async () => {
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
    await expect(assignTeamCaptain(auction.id, "does-not-matter", null, fx.admin.id)).rejects.toThrow(
      /only be assigned once the auction has concluded/
    );
  });

  it("re-assigning to a different player overwrites cleanly", async () => {
    const fx = await buildCaptainFixture();
    await assignTeamCaptain(fx.auction.id, fx.team1Entry.id, fx.apA.id, fx.admin.id);
    await assignTeamCaptain(fx.auction.id, fx.team1Entry.id, fx.apB.id, fx.admin.id);

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(entry.captainAuctionPlayerId).toBe(fx.apB.id);
  });

  it("clears an existing captain when assigned null, and null-on-null is a safe no-op", async () => {
    const fx = await buildCaptainFixture();
    await assignTeamCaptain(fx.auction.id, fx.team1Entry.id, fx.apA.id, fx.admin.id);
    await assignTeamCaptain(fx.auction.id, fx.team1Entry.id, null, fx.admin.id);

    const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({ where: { id: fx.team1Entry.id } });
    expect(entry.captainAuctionPlayerId).toBeNull();

    await expect(assignTeamCaptain(fx.auction.id, fx.team1Entry.id, null, fx.admin.id)).resolves.toBeUndefined();
  });

  it("is blocked once the league is read-only", async () => {
    const fx = await buildCaptainFixture();
    await updateLeagueSettings(fx.league.id, { endDate: PAST });

    await expect(assignTeamCaptain(fx.auction.id, fx.team1Entry.id, fx.apA.id, fx.admin.id)).rejects.toThrow(
      /read-only/
    );
  });

  it("is reflected in getAuctionState's isCaptain flag for exactly the assigned player", async () => {
    const fx = await buildCaptainFixture();
    await assignTeamCaptain(fx.auction.id, fx.team1Entry.id, fx.apA.id, fx.admin.id);

    const state = await getAuctionState(fx.auction.id);
    const players = state!.players;
    expect(players.find((p) => p.id === fx.apA.id)?.isCaptain).toBe(true);
    expect(players.find((p) => p.id === fx.apB.id)?.isCaptain).toBe(false);
    expect(players.find((p) => p.id === fx.apC.id)?.isCaptain).toBe(false);
  });
});
