import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type CreateLeagueInput = {
  name: string;
  type: string;
};

export async function createLeague(input: CreateLeagueInput) {
  const name = input.name.trim();
  const type = input.type.trim();
  if (!name) throw new ValidationError("League name is required");
  if (!type) throw new ValidationError("League type is required");

  const existing = await prisma.league.findUnique({ where: { name } });
  if (existing) throw new ValidationError(`A league named "${name}" already exists`);

  return prisma.league.create({ data: { name, type } });
}

export async function listLeagues() {
  return prisma.league.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, rosters: true, tournaments: true } },
    },
  });
}

export async function deleteLeague(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { _count: { select: { users: true, rosters: true, tournaments: true } } },
  });
  if (!league) throw new ValidationError("League not found");

  const blockers: string[] = [];
  if (league._count.users > 0) blockers.push(`${league._count.users} user(s)`);
  if (league._count.rosters > 0) blockers.push(`${league._count.rosters} roster(s)`);
  if (league._count.tournaments > 0) blockers.push(`${league._count.tournaments} tournament(s)`);

  if (blockers.length > 0) {
    // Users hang off a league via ON DELETE SET NULL — the DB alone wouldn't
    // stop this delete, but silently detaching a non-admin user from every
    // league would break the "every non-admin belongs to exactly one league"
    // invariant the rest of the app relies on for scoping.
    throw new ValidationError(
      `Cannot delete "${league.name}" — it has ${blockers.join(", ")}. Reassign or remove those first.`
    );
  }

  await prisma.league.delete({ where: { id: leagueId } });
}
