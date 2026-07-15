import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type CreateTournamentInput = {
  name: string;
  rosterId: string;
  numTeams: number;
  squadSize: number;
  startDate: Date;
  endDate: Date;
  createdById: string;
};

export async function createTournament(input: CreateTournamentInput) {
  if (!input.name.trim()) throw new ValidationError("Tournament name is required");
  if (input.numTeams < 2) throw new ValidationError("Number of teams must be at least 2");
  if (input.squadSize < 1) throw new ValidationError("Squad size must be at least 1");
  if (input.endDate < input.startDate) {
    throw new ValidationError("End date cannot be before start date");
  }

  const roster = await prisma.playerRoster.findUnique({ where: { id: input.rosterId } });
  if (!roster) throw new ValidationError("Roster not found");

  return prisma.tournament.create({
    data: {
      name: input.name.trim(),
      rosterId: input.rosterId,
      numTeams: input.numTeams,
      squadSize: input.squadSize,
      startDate: input.startDate,
      endDate: input.endDate,
      createdById: input.createdById,
    },
  });
}

export type CreateTeamInput = {
  tournamentId: string;
  name: string;
  managerId?: string;
  managerOccupiesSlot: boolean;
};

export async function createTeam(input: CreateTeamInput) {
  if (!input.name.trim()) throw new ValidationError("Team name is required");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { _count: { select: { teams: true } } },
  });
  if (!tournament) throw new ValidationError("Tournament not found");

  if (tournament._count.teams >= tournament.numTeams) {
    throw new ValidationError(
      `Tournament already has the maximum of ${tournament.numTeams} teams`
    );
  }

  if (input.managerId) {
    const manager = await prisma.user.findUnique({ where: { id: input.managerId } });
    if (!manager || manager.role !== "TEAM_MANAGER") {
      throw new ValidationError("Selected manager is not a valid team manager account");
    }
  }

  const existing = await prisma.team.findUnique({
    where: { tournamentId_name: { tournamentId: input.tournamentId, name: input.name.trim() } },
  });
  if (existing) throw new ValidationError("A team with this name already exists in this tournament");

  return prisma.team.create({
    data: {
      tournamentId: input.tournamentId,
      name: input.name.trim(),
      managerId: input.managerId,
      managerOccupiesSlot: input.managerOccupiesSlot,
    },
  });
}

export async function deleteTournament(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { auctions: true },
  });
  if (!tournament) throw new ValidationError("Tournament not found");

  const liveAuction = tournament.auctions.find((a) => a.status === "BIDDING");
  if (liveAuction) {
    throw new ValidationError(
      `Cannot delete — auction "${liveAuction.name}" is currently in progress. Conclude it first.`
    );
  }

  await prisma.tournament.delete({ where: { id: tournamentId } });
}
