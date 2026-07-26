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
