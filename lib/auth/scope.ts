import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { assertInScope, requireAdminOrLeagueAdmin } from "@/lib/auth/guards";

/**
 * Resolves the effective league scope for an admin list view, honoring the
 * sidebar's league switcher. A League Admin is always confined to their own
 * league regardless of the URL — only a site Admin's (unrestricted) view can
 * be narrowed this way, and it's a display filter, not a security boundary,
 * so it must never be used in place of `requireAdminOrLeagueAdmin` for
 * mutations or by-ID access checks.
 */
export async function resolveAdminScope(selectedLeagueId?: string) {
  const { session, leagueId } = await requireAdminOrLeagueAdmin();
  const effectiveLeagueId = leagueId !== null ? leagueId : selectedLeagueId || null;
  return { session, leagueId: effectiveLeagueId };
}

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

export async function loadScopedTeam(teamId: string, leagueId: string | null) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { tournament: true },
  });
  if (!team) throw new ValidationError("Team not found");
  assertInScope(leagueId, team.tournament.leagueId);
  return team;
}
