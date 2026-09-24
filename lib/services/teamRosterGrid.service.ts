import { prisma } from "@/lib/prisma";
import { assertCanViewAllTeamRosters, type requireSession } from "@/lib/auth/guards";
import { InvalidStateTransitionError, ValidationError } from "@/lib/errors";
import type { TeamRosterGrid } from "@/lib/teamRosterGrid";

type Session = Awaited<ReturnType<typeof requireSession>>;

/**
 * Every team's final roster for a concluded auction, laid out for the "all
 * rosters" table and its CSV/Excel downloads (see lib/teamRosterGrid.ts).
 * The single entry point for the page and both download routes, so the
 * who-may-see-it and only-once-concluded rules can't drift between them.
 * Access is checked before the auction's state, so someone without access
 * can't probe whether an auction has finished.
 */
export async function loadTeamRosterGrid(session: Session, auctionId: string): Promise<TeamRosterGrid> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      tournament: { select: { name: true, leagueId: true, league: { select: { name: true } } } },
      entries: {
        include: {
          team: { select: { name: true, managerId: true } },
          playersWon: {
            include: {
              player: { select: { name: true } },
              category: { select: { name: true, basePrice: true } },
            },
          },
        },
      },
    },
  });
  if (!auction) throw new ValidationError("Auction not found");

  const managesTeamInAuction = auction.entries.some((e) => e.team.managerId === session.user.id);
  assertCanViewAllTeamRosters(session, auction, managesTeamInAuction);

  if (auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError("Team rosters are shown once the auction has concluded");
  }

  const teams = auction.entries
    .map((entry) => ({
      entryId: entry.id,
      teamName: entry.team.name,
      isMine: entry.team.managerId === session.user.id,
      members: [...entry.playersWon]
        .sort(
          (a, b) =>
            Number(b.category.basePrice) - Number(a.category.basePrice) ||
            a.category.name.localeCompare(b.category.name) ||
            a.player.name.localeCompare(b.player.name)
        )
        .map((ap) => ({ name: ap.player.name, categoryName: ap.category.name })),
    }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));

  return {
    auctionName: auction.name,
    tournamentName: auction.tournament.name,
    leagueName: auction.tournament.league.name,
    teams,
  };
}
