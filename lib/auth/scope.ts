import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { assertInScope } from "@/lib/auth/guards";

export async function loadScopedRoster(rosterId: string, leagueId: string | null) {
  const roster = await prisma.playerRoster.findUnique({ where: { id: rosterId } });
  if (!roster) throw new ValidationError("Roster not found");
  assertInScope(leagueId, roster.leagueId);
  return roster;
}

export async function loadScopedTournament(tournamentId: string, leagueId: string | null) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new ValidationError("Tournament not found");
  assertInScope(leagueId, tournament.leagueId);
  return tournament;
}

export async function loadScopedAuction(auctionId: string, leagueId: string | null) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) throw new ValidationError("Auction not found");
  assertInScope(leagueId, auction.tournament.leagueId);
  return auction;
}
