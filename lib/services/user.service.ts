import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { assertLeagueNotReadOnly } from "@/lib/services/league.service";

/** Finds an existing person by loginId, email, or phone — for the
 * admin-assisted "add an existing person to this league" flow. Exact match
 * (case-insensitive on loginId, matching how login itself resolves it). */
export async function findPersonByIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;
  return prisma.user.findFirst({
    where: {
      OR: [
        { loginId: { equals: value, mode: "insensitive" } },
        { email: { equals: value, mode: "insensitive" } },
        { phone: value },
      ],
    },
  });
}

// Now only ever exercised against site-Admin identities (see
// deleteUserAction) — an Admin isn't scoped to any one league, so there's no
// read-only-league check here anymore; that lives on deleteMembership below,
// for the league-scoped roles.
export async function deleteUser(userId: string, requestingUserId: string) {
  if (userId === requestingUserId) {
    throw new ValidationError("You cannot delete your own account while logged in.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          createdRosters: true,
          createdTournaments: true,
          createdAuctions: true,
          managedTeams: true,
        },
      },
    },
  });
  if (!user) throw new ValidationError("User not found");

  const blockers: string[] = [];
  if (user._count.createdRosters > 0) blockers.push(`${user._count.createdRosters} roster(s)`);
  if (user._count.createdTournaments > 0) blockers.push(`${user._count.createdTournaments} tournament(s)`);
  if (user._count.createdAuctions > 0) blockers.push(`${user._count.createdAuctions} auction(s)`);
  if (user._count.managedTeams > 0) blockers.push(`${user._count.managedTeams} team(s) they manage`);

  if (blockers.length > 0) {
    throw new ValidationError(
      `Cannot delete "${user.name}" — they are linked to ${blockers.join(", ")}. Reassign or remove those first.`
    );
  }

  await prisma.user.delete({ where: { id: userId } });
}

export async function setUserActive(userId: string, requestingUserId: string, isActive: boolean) {
  if (userId === requestingUserId && !isActive) {
    throw new ValidationError("You cannot disable your own account while logged in.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ValidationError("User not found");

  await prisma.user.update({ where: { id: userId }, data: { isActive } });
}

/** Removes a specific league's access for a person — never touches the
 * underlying identity or their other leagues' memberships. */
export async function deleteMembership(membershipId: string, requestingUserId: string) {
  const membership = await prisma.leagueMembership.findUnique({
    where: { id: membershipId },
    include: { league: true, user: true },
  });
  if (!membership) throw new ValidationError("Membership not found");
  if (membership.userId === requestingUserId) {
    throw new ValidationError("You cannot remove your own access while logged in.");
  }
  assertLeagueNotReadOnly(membership.league);

  const { userId, leagueId } = membership;
  const [rosterCount, tournamentCount, auctionCount, teamCount] = await Promise.all([
    prisma.playerRoster.count({ where: { leagueId, createdById: userId } }),
    prisma.tournament.count({ where: { leagueId, createdById: userId } }),
    prisma.auction.count({ where: { tournament: { leagueId }, createdById: userId } }),
    prisma.team.count({ where: { tournament: { leagueId }, managerId: userId } }),
  ]);

  const blockers: string[] = [];
  if (rosterCount > 0) blockers.push(`${rosterCount} roster(s)`);
  if (tournamentCount > 0) blockers.push(`${tournamentCount} tournament(s)`);
  if (auctionCount > 0) blockers.push(`${auctionCount} auction(s)`);
  if (teamCount > 0) blockers.push(`${teamCount} team(s) they manage`);

  if (blockers.length > 0) {
    throw new ValidationError(
      `Cannot remove "${membership.user.name}" from this league — they are linked to ${blockers.join(", ")} in it. Reassign or remove those first.`
    );
  }

  await prisma.leagueMembership.delete({ where: { id: membershipId } });
}

/** Approves/revokes a person's access to one specific league. Approving
 * (isActive: false -> true) a person's very first membership anywhere also
 * activates their account — that's the only thing that unblocks login for a
 * brand-new self-registered signup (see selfRegistration.service.ts).
 * Disabling one league's membership never touches the account or their
 * other leagues. */
export async function setMembershipActive(
  membershipId: string,
  requestingUserId: string,
  isActive: boolean
) {
  const membership = await prisma.leagueMembership.findUnique({
    where: { id: membershipId },
    include: { user: true },
  });
  if (!membership) throw new ValidationError("Membership not found");
  if (membership.userId === requestingUserId && !isActive) {
    throw new ValidationError("You cannot disable your own access while logged in.");
  }

  await prisma.leagueMembership.update({ where: { id: membershipId }, data: { isActive } });

  if (isActive && !membership.user.isActive) {
    await prisma.user.update({ where: { id: membership.userId }, data: { isActive: true } });
  }
}
