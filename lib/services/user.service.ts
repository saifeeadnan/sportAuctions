import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

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
