import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { assertInScope, requireAdminOrLeagueAdmin } from "@/lib/auth/guards";

/**
 * Resolves the effective league scope for an admin list view, honoring the
 * sidebar's league switcher. A League Admin is always confined to their own
 * league membership(s) regardless of the URL — only a site Admin's
 * (unrestricted) view, or a multi-league League Admin narrowing to one of
 * their own leagues, can be filtered this way. Display filter only, never a
 * substitute for `requireAdminOrLeagueAdmin` on mutations or by-ID checks.
 */
export async function resolveAdminScope(selectedLeagueId?: string) {
  const { session, leagueIds } = await requireAdminOrLeagueAdmin();
  if (leagueIds === null) {
    // Site admin — unrestricted, narrowed via the sidebar filter if selected.
    return { session, leagueIds: selectedLeagueId ? [selectedLeagueId] : null };
  }
  // League admin — always confined to their own league(s); narrow to one of
  // them if the sidebar selects a specific one, otherwise show all of them.
  const effectiveLeagueIds =
    selectedLeagueId && leagueIds.includes(selectedLeagueId) ? [selectedLeagueId] : leagueIds;
  return { session, leagueIds: effectiveLeagueIds };
}

export async function loadScopedRoster(rosterId: string, leagueIds: string[] | null) {
  const roster = await prisma.playerRoster.findUnique({ where: { id: rosterId } });
  if (!roster) throw new ValidationError("Roster not found");
  assertInScope(leagueIds, roster.leagueId);
  return roster;
}

export async function loadScopedTournament(tournamentId: string, leagueIds: string[] | null) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new ValidationError("Tournament not found");
  assertInScope(leagueIds, tournament.leagueId);
  return tournament;
}

export async function loadScopedAuction(auctionId: string, leagueIds: string[] | null) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) throw new ValidationError("Auction not found");
  assertInScope(leagueIds, auction.tournament.leagueId);
  return auction;
}

export async function loadScopedTeam(teamId: string, leagueIds: string[] | null) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { tournament: true },
  });
  if (!team) throw new ValidationError("Team not found");
  assertInScope(leagueIds, team.tournament.leagueId);
  return team;
}

export async function loadScopedTournamentSponsor(sponsorId: string, leagueIds: string[] | null) {
  const sponsor = await prisma.tournamentSponsor.findUnique({
    where: { id: sponsorId },
    include: { tournament: true },
  });
  if (!sponsor) throw new ValidationError("Sponsor not found");
  assertInScope(leagueIds, sponsor.tournament.leagueId);
  return sponsor;
}
