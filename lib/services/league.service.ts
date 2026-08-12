import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";

export type LeagueSettingsInput = {
  startDate?: Date | null;
  endDate?: Date | null;
  maxTournaments?: number | null;
  maxTeamsPerTournament?: number | null;
  maxSponsorsPerTournament?: number | null;
};

const CAP_LABELS: Record<
  "maxTournaments" | "maxTeamsPerTournament" | "maxSponsorsPerTournament",
  string
> = {
  maxTournaments: "Max tournaments",
  maxTeamsPerTournament: "Max teams per tournament",
  maxSponsorsPerTournament: "Max sponsors per tournament",
};

/** Shared by createLeague and updateLeagueSettings so the two validate the
 * same optional fields identically. */
function validateLeagueSettings(input: LeagueSettingsInput) {
  if (
    input.startDate != null &&
    input.endDate != null &&
    input.endDate < input.startDate
  ) {
    throw new ValidationError("End date cannot be before start date");
  }
  for (const key of Object.keys(CAP_LABELS) as (keyof typeof CAP_LABELS)[]) {
    const value = input[key];
    if (value != null && (!Number.isInteger(value) || value < 1)) {
      throw new ValidationError(`${CAP_LABELS[key]} must be a positive whole number`);
    }
  }
}

/** Only endDate drives read-only — startDate is informational. Derived from
 * the date rather than a stored flag so it can never drift out of sync. */
export function isLeagueReadOnly(league: { endDate: Date | null }): boolean {
  return league.endDate != null && league.endDate < new Date();
}

export function assertLeagueNotReadOnly(league: { name: string; endDate: Date | null }) {
  if (isLeagueReadOnly(league)) {
    throw new InvalidStateTransitionError(
      `"${league.name}" is read-only — its end date has passed. Existing records can still be viewed, but no changes can be made.`
    );
  }
}

/** Loads the league that owns the given auction (via its tournament) and
 * asserts it isn't read-only — the single check point shared by every
 * auction/bidding mutation in auction.service.ts and bidding.service.ts,
 * so a read-only league also freezes every Auctioneer console action and
 * auction-settings edit, not just new-record creation. */
export async function assertAuctionLeagueNotReadOnly(auctionId: string) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: { include: { league: true } } },
  });
  if (!auction) throw new ValidationError("Auction not found");
  assertLeagueNotReadOnly(auction.tournament.league);
}

export type CreateLeagueInput = {
  name: string;
  type: string;
} & LeagueSettingsInput;

export async function createLeague(input: CreateLeagueInput) {
  const name = input.name.trim();
  const type = input.type.trim();
  if (!name) throw new ValidationError("League name is required");
  if (!type) throw new ValidationError("League type is required");
  validateLeagueSettings(input);

  const existing = await prisma.league.findUnique({ where: { name } });
  if (existing) throw new ValidationError(`A league named "${name}" already exists`);

  return prisma.league.create({
    data: {
      name,
      type,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      maxTournaments: input.maxTournaments ?? null,
      maxTeamsPerTournament: input.maxTeamsPerTournament ?? null,
      maxSponsorsPerTournament: input.maxSponsorsPerTournament ?? null,
    },
  });
}

/**
 * Lowering a cap below an already-existing count is intentionally allowed —
 * it only changes the threshold future creation is checked against, never
 * touches existing rows. There's no update path for Tournament.numTeams
 * today either, so "a cap can't retroactively invalidate what already
 * exists" is already this codebase's implicit rule; this just makes it
 * explicit for the new league-level caps too.
 */
export async function updateLeagueSettings(leagueId: string, input: LeagueSettingsInput) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new ValidationError("League not found");

  const startDate = input.startDate === undefined ? league.startDate : input.startDate;
  const endDate = input.endDate === undefined ? league.endDate : input.endDate;
  validateLeagueSettings({ ...input, startDate, endDate });

  return prisma.league.update({
    where: { id: leagueId },
    data: {
      startDate,
      endDate,
      maxTournaments: input.maxTournaments === undefined ? league.maxTournaments : input.maxTournaments,
      maxTeamsPerTournament:
        input.maxTeamsPerTournament === undefined
          ? league.maxTeamsPerTournament
          : input.maxTeamsPerTournament,
      maxSponsorsPerTournament:
        input.maxSponsorsPerTournament === undefined
          ? league.maxSponsorsPerTournament
          : input.maxSponsorsPerTournament,
    },
  });
}

export async function listLeagues() {
  return prisma.league.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, rosters: true, tournaments: true } },
      logo: { select: { id: true } },
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
