import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { ROSTER_FIELD_KEYS, type RosterFieldKey } from "@/lib/rosterTemplates";

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

/** Defensively filters out any value no longer in ROSTER_FIELD_KEYS — guards
 * against a stale field key surviving a future rename of the fixed list. */
export async function getLeagueRosterFieldConfig(leagueId: string): Promise<RosterFieldKey[]> {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { mandatoryRosterFields: true },
  });
  if (!league) throw new ValidationError("League not found");

  const stored = Array.isArray(league.mandatoryRosterFields) ? league.mandatoryRosterFields : [];
  return ROSTER_FIELD_KEYS.filter((key) => stored.includes(key));
}

/** No assertLeagueNotReadOnly guard — read-only blocks *creating* new
 * records (rosters, players, tournaments), not editing league config, same
 * posture as updateLeagueSettings above. Stored filtered+deduped in
 * ROSTER_FIELD_KEYS's canonical order so matchingRosterTemplateKey
 * comparisons stay stable regardless of the order the UI submits them in. */
export async function updateLeagueRosterFieldConfig(leagueId: string, mandatoryFields: string[]) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new ValidationError("League not found");

  const unknown = mandatoryFields.filter((f) => !ROSTER_FIELD_KEYS.includes(f as RosterFieldKey));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown roster field(s): ${unknown.join(", ")}`);
  }

  const canonical = ROSTER_FIELD_KEYS.filter((key) => mandatoryFields.includes(key));

  return prisma.league.update({
    where: { id: leagueId },
    data: { mandatoryRosterFields: canonical },
  });
}

/** Looked up fresh at read time (never cached into a session/JWT) so a
 * league rename shows up immediately everywhere it's displayed — same
 * "derive, don't cache" posture as isLeagueReadOnly above. Used by the
 * mobile API to turn a session's bare {leagueId, role} memberships into
 * something a screen can actually show a person. */
export async function leagueNamesByIds(leagueIds: string[]): Promise<Record<string, string>> {
  if (leagueIds.length === 0) return {};
  const leagues = await prisma.league.findMany({
    where: { id: { in: leagueIds } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(leagues.map((l) => [l.id, l.name]));
}

export async function listLeagues() {
  return prisma.league.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { memberships: true, rosters: true, tournaments: true } },
      logo: { select: { id: true } },
    },
  });
}

export async function deleteLeague(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { _count: { select: { memberships: true, rosters: true, tournaments: true } } },
  });
  if (!league) throw new ValidationError("League not found");

  const blockers: string[] = [];
  if (league._count.memberships > 0) blockers.push(`${league._count.memberships} member(s)`);
  if (league._count.rosters > 0) blockers.push(`${league._count.rosters} roster(s)`);
  if (league._count.tournaments > 0) blockers.push(`${league._count.tournaments} tournament(s)`);

  if (blockers.length > 0) {
    // LeagueMembership cascade-deletes with the league (onDelete: Cascade) —
    // the DB alone wouldn't stop this delete, but silently removing every
    // person's access to a league they still actively belong to would be a
    // surprising, unrecoverable side effect of what looks like tidying up an
    // empty league.
    throw new ValidationError(
      `Cannot delete "${league.name}" — it has ${blockers.join(", ")}. Reassign or remove those first.`
    );
  }

  await prisma.league.delete({ where: { id: leagueId } });
}
