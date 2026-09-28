import { prisma } from "@/lib/prisma";
import { createAuctionReadyFixture } from "./fixtures";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer, concludeAuction } from "@/lib/services/bidding.service";

/**
 * A completed, small auction with 4 teams of 2 players each — shaped like a
 * real pickleball draft (few players per team), not a full cricket squad.
 * Team names double as each team's pickleball group: "Alpha"/"Beta" in group
 * A, "Gamma"/"Delta" in group B.
 */
export async function buildPickleballFixture() {
  const teamNames = ["Alpha", "Beta", "Gamma", "Delta"];
  const playerNames = teamNames.flatMap((t) => [`${t} Player 1`, `${t} Player 2`]);
  // squadSize is 1 more than the 2 players each team actually wins: a fresh
  // Team defaults managerOccupiesSlot=true, which reserves one slot before
  // any auction assignment happens (see auction.service.ts's startBidding).
  const fx = await createAuctionReadyFixture({ playerNames, teamNames, squadSize: 3 });

  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Pickleball Draft",
    teamBudget: 1000,
    createdById: fx.admin.id,
    categories: [{ name: "Regular", basePrice: 50 }],
    playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

  const entries = await prisma.teamAuctionEntry.findMany({ where: { auctionId: auction.id }, include: { team: true } });
  const entryByTeam = new Map(entries.map((e) => [e.team.name, e]));
  const auctionPlayers = await prisma.auctionPlayer.findMany({ where: { auctionId: auction.id }, include: { player: true } });
  const apByName = (name: string) => auctionPlayers.find((ap) => ap.player.name === name)!;

  for (const teamName of teamNames) {
    const entry = entryByTeam.get(teamName)!;
    for (const suffix of ["Player 1", "Player 2"]) {
      await adminAssignPlayer(auction.id, apByName(`${teamName} ${suffix}`).id, entry.id, 50, fx.admin.id);
    }
  }
  await concludeAuction(auction.id, fx.admin.id);

  const teams = await prisma.team.findMany({ where: { tournamentId: fx.tournament.id } });
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const players = await prisma.player.findMany({ where: { rosterId: fx.roster.id } });
  const playerByName = new Map(players.map((p) => [p.name, p]));

  return { fx, auction, adminId: fx.admin.id, teamByName, playerByName };
}

/** A minimal valid schedule for `fx`'s 4 teams: one match per group, best-of-3. */
export function basicSchedule(teamByName: Map<string, { id: string }>) {
  const id = (name: string) => teamByName.get(name)!.id;
  return {
    teams: [
      { teamId: id("Alpha"), group: "A" },
      { teamId: id("Beta"), group: "A" },
      { teamId: id("Gamma"), group: "B" },
      { teamId: id("Delta"), group: "B" },
    ],
    matches: [
      { matchNumber: 1, round: "1", court: null, group: "A", team1Id: id("Alpha"), team2Id: id("Beta"), gamesToPlay: 3 },
      { matchNumber: 2, round: "1", court: "Court 2", group: "B", team1Id: id("Gamma"), team2Id: id("Delta"), gamesToPlay: 3 },
    ],
  };
}
