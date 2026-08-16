import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

let counter = 0;
/** A short, collision-free suffix per fixture object within a single test
 * run — tests never share fixtures, so uniqueness (not readability) is all
 * that matters here. */
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export async function createFixtureLeague(
  overrides: Partial<Prisma.LeagueCreateInput> = {}
) {
  return prisma.league.create({
    data: { name: unique("League"), type: "Cricket", ...overrides },
  });
}

export async function createFixtureAdmin() {
  return prisma.user.create({
    data: {
      loginId: unique("admin"),
      passwordHash: await bcrypt.hash("password123", 4),
      name: "Test Admin",
      isSiteAdmin: true,
    },
  });
}

/** managerBasePrice defaults to 50 — the exact fee amount the ported
 * verify-*.ts scenarios were originally written against. Returns the plain
 * User (not the LeagueMembership) since every existing caller just needs an
 * id/name/loginId to use as a manager — the membership (role, base price,
 * this league) is created alongside it but not part of the return shape. */
export async function createFixtureManager(leagueId: string, managerBasePrice = 50) {
  const user = await prisma.user.create({
    data: {
      loginId: unique("manager"),
      passwordHash: await bcrypt.hash("password123", 4),
      name: unique("Manager"),
    },
  });
  await prisma.leagueMembership.create({
    data: { userId: user.id, leagueId, role: "TEAM_MANAGER", managerBasePrice, isActive: true },
  });
  return user;
}

export async function createFixtureRoster(
  leagueId: string,
  createdById: string,
  playerNames: string[]
) {
  const roster = await prisma.playerRoster.create({
    data: { name: unique("Roster"), leagueId, createdById },
  });
  await prisma.player.createMany({
    data: playerNames.map((name) => ({ rosterId: roster.id, name })),
  });
  const players = await prisma.player.findMany({
    where: { rosterId: roster.id },
    orderBy: { name: "asc" },
  });
  return { roster, players };
}

export async function createFixtureTournament(input: {
  leagueId: string;
  rosterId: string;
  createdById: string;
  numTeams: number;
  squadSize: number;
}) {
  return prisma.tournament.create({
    data: {
      name: unique("Tournament"),
      leagueId: input.leagueId,
      rosterId: input.rosterId,
      createdById: input.createdById,
      numTeams: input.numTeams,
      squadSize: input.squadSize,
      startDate: new Date(),
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

/** A person with an actual LeagueMembership row (not just the legacy flat
 * User columns createFixtureManager still uses) — for tests exercising the
 * membership-based flows (registration re-association, admin membership
 * actions). Returns the plaintext password alongside the user since tests
 * verifying password checks need it. */
export async function createFixtureUserWithMembership(
  leagueId: string,
  role: "LEAGUE_ADMIN" | "TEAM_MANAGER" | "AUCTIONEER" | "VIEWER" = "VIEWER",
  opts: { isActive?: boolean; membershipActive?: boolean; password?: string } = {}
) {
  const password = opts.password ?? "password123";
  const user = await prisma.user.create({
    data: {
      loginId: unique("user"),
      passwordHash: await bcrypt.hash(password, 4),
      name: unique("Person"),
      isActive: opts.isActive ?? true,
    },
  });
  const membership = await prisma.leagueMembership.create({
    data: { userId: user.id, leagueId, role, isActive: opts.membershipActive ?? true },
  });
  return { user, membership, password };
}

export async function createFixtureTeam(
  tournamentId: string,
  name: string,
  managerId?: string | null
) {
  return prisma.team.create({
    data: { tournamentId, name, managerId: managerId ?? null, managerOccupiesSlot: true },
  });
}

/** Builds a full ready-to-auction baseline: one league, one admin, one
 * roster with `playerNames.length` players, one tournament sized for
 * `teamNames.length` teams, and those teams — each with its own fresh
 * manager (managerBasePrice 50) unless `teamNames[i]`'s manager is
 * overridden via `managerLoginIdByTeam`, which self-matches a manager's
 * loginId to one of the roster's players (the "merged manager slot" case). */
export async function createAuctionReadyFixture(input: {
  playerNames: string[];
  teamNames: string[];
  squadSize: number;
  selfMatch?: { teamName: string; playerName: string }[];
}) {
  const league = await createFixtureLeague();
  const admin = await createFixtureAdmin();
  const { roster, players } = await createFixtureRoster(league.id, admin.id, input.playerNames);
  const tournament = await createFixtureTournament({
    leagueId: league.id,
    rosterId: roster.id,
    createdById: admin.id,
    numTeams: input.teamNames.length,
    squadSize: input.squadSize,
  });

  const teams = [];
  for (const teamName of input.teamNames) {
    const manager = await createFixtureManager(league.id);
    const selfMatch = input.selfMatch?.find((m) => m.teamName === teamName);
    if (selfMatch) {
      const player = players.find((p) => p.name === selfMatch.playerName);
      await prisma.player.update({ where: { id: player!.id }, data: { loginId: manager.loginId } });
    }
    teams.push(await createFixtureTeam(tournament.id, teamName, manager.id));
  }

  return { league, admin, roster, players, tournament, teams };
}
