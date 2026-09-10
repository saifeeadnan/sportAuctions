import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { assertLeagueNotReadOnly } from "@/lib/services/league.service";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import { groupPosition, type PositionGroup } from "@/lib/teamStrength";
import {
  seedingWindowStatus,
  computeSuggestedSeeding,
  type SeedingWindowStatus,
  type SuggestedSeedRow,
} from "@/lib/seeding";

const MIN_MAX_SEED = 2;
const MAX_MAX_SEED = 20;

/** Resolves the roster (with its league, for read-only checks) or throws —
 * the same shape createPlayer already loads. */
async function loadRosterWithLeague(rosterId: string) {
  const roster = await prisma.playerRoster.findUnique({
    where: { id: rosterId },
    include: { league: true },
  });
  if (!roster) throw new ValidationError("Roster not found");
  return roster;
}

/** This user's own Player row on this roster, if any, by case-insensitive
 * loginId — the same self-match rule fantasy teams, self-registration, and
 * rules-document visibility already use. */
async function findSelfPlayer(rosterId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { loginId: true } });
  if (!user?.loginId) return null;
  return prisma.player.findFirst({
    where: { rosterId, loginId: { equals: user.loginId, mode: "insensitive" } },
  });
}

/**
 * Opens (or edits) a roster's rating window. `maxSeed` can't be changed once
 * submissions exist (it would silently invalidate everyone's existing
 * scores), and a finalized window can't be reopened — start a fresh peer
 * process by design, not a "reopen" flow.
 */
export async function upsertSeedingWindow(
  rosterId: string,
  input: { opensAt: Date; closesAt: Date; maxSeed: number },
  actorUserId: string
) {
  if (Number.isNaN(input.opensAt.getTime()) || Number.isNaN(input.closesAt.getTime())) {
    throw new ValidationError("Invalid date");
  }
  if (input.closesAt <= input.opensAt) {
    throw new ValidationError("Close date must be after the open date");
  }
  if (
    !Number.isInteger(input.maxSeed) ||
    input.maxSeed < MIN_MAX_SEED ||
    input.maxSeed > MAX_MAX_SEED
  ) {
    throw new ValidationError(
      `Max seed must be a whole number between ${MIN_MAX_SEED} and ${MAX_MAX_SEED}`
    );
  }

  const roster = await loadRosterWithLeague(rosterId);
  assertLeagueNotReadOnly(roster.league);

  const existing = await prisma.playerSeedingWindow.findUnique({
    where: { rosterId },
    include: { _count: { select: { submissions: true } } },
  });
  if (existing?.finalizedAt) {
    throw new InvalidStateTransitionError(
      "This roster's peer seeding has already been finalized — reopening isn't supported"
    );
  }
  if (existing && existing._count.submissions > 0 && existing.maxSeed !== input.maxSeed) {
    throw new ValidationError(
      "Max seed can't be changed once ratings have been submitted — it would invalidate existing scores"
    );
  }

  return prisma.$transaction(async (tx) => {
    const window = await tx.playerSeedingWindow.upsert({
      where: { rosterId },
      create: {
        rosterId,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        maxSeed: input.maxSeed,
        createdById: actorUserId,
      },
      update: {
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        maxSeed: input.maxSeed,
      },
    });
    await writeAuditLog(tx, {
      entityType: "PlayerRoster",
      entityId: rosterId,
      action: existing ? "SEEDING_WINDOW_UPDATED" : "SEEDING_WINDOW_OPENED",
      actorUserId,
      before: existing
        ? {
            opensAt: existing.opensAt.toISOString(),
            closesAt: existing.closesAt.toISOString(),
            maxSeed: existing.maxSeed,
          }
        : null,
      after: {
        opensAt: input.opensAt.toISOString(),
        closesAt: input.closesAt.toISOString(),
        maxSeed: input.maxSeed,
      },
    });
    return window;
  });
}

export type SeedingEligibility =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      selfPlayerId: string;
      window: { opensAt: Date; closesAt: Date; maxSeed: number; finalizedAt: Date | null } | null;
    };

/** Whether — and as whom — this user may rate this roster's players. Mirrors
 * getFantasyEligibility's shape: a generic "not found" for an out-of-scope
 * roster (never confirms it exists to a caller who shouldn't see it), a
 * specific reason otherwise. */
export async function getSeedingEligibility(
  rosterId: string,
  userId: string,
  leagueIds: string[] | null
): Promise<SeedingEligibility> {
  const roster = await prisma.playerRoster.findUnique({ where: { id: rosterId } });
  if (!roster) return { eligible: false, reason: "Roster not found" };
  if (leagueIds !== null && !leagueIds.includes(roster.leagueId)) {
    return { eligible: false, reason: "Roster not found" };
  }

  const selfPlayer = await findSelfPlayer(rosterId, userId);
  if (!selfPlayer) {
    return { eligible: false, reason: "You aren't on this roster, so you can't rate its players" };
  }

  const window = await prisma.playerSeedingWindow.findUnique({ where: { rosterId } });
  return {
    eligible: true,
    selfPlayerId: selfPlayer.id,
    window: window
      ? {
          opensAt: window.opensAt,
          closesAt: window.closesAt,
          maxSeed: window.maxSeed,
          finalizedAt: window.finalizedAt,
        }
      : null,
  };
}

export type SeedingRosterListItem = {
  rosterId: string;
  rosterName: string;
  leagueName: string;
  status: SeedingWindowStatus;
  opensAt: Date;
  closesAt: Date;
  maxSeed: number;
  ratedCount: number;
  ratableCount: number;
};

/** Every roster in scope this user can rate on (has a window, and the user
 * has a self-match player) — the index-page rows for /viewer/rate and
 * /manager/rate. */
export async function listSeedingRosters(
  userId: string,
  leagueIds: string[] | null
): Promise<SeedingRosterListItem[]> {
  const windows = await prisma.playerSeedingWindow.findMany({
    where: { roster: leagueIds ? { leagueId: { in: leagueIds } } : {} },
    include: {
      roster: { include: { league: { select: { name: true } }, _count: { select: { players: true } } } },
    },
    orderBy: { opensAt: "desc" },
  });

  const results: SeedingRosterListItem[] = [];
  for (const window of windows) {
    const selfPlayer = await findSelfPlayer(window.rosterId, userId);
    if (!selfPlayer) continue;
    const ratedCount = await prisma.playerSeedSubmission.count({
      where: { windowId: window.id, raterUserId: userId },
    });
    results.push({
      rosterId: window.rosterId,
      rosterName: window.roster.name,
      leagueName: window.roster.league.name,
      status: seedingWindowStatus(window),
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      maxSeed: window.maxSeed,
      ratedCount,
      ratableCount: Math.max(0, window.roster._count.players - 1),
    });
  }
  return results;
}

export type SeedingSheetPlayer = {
  playerId: string;
  name: string;
  position: string | null;
  photoUrl: string | null;
  positionGroup: PositionGroup;
  mySeed: number | null;
};

export type SeedingSheetFinalRow = {
  seed: number;
  playerId: string;
  name: string;
  position: string | null;
};

export type SeedingSheet =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      status: "scheduled" | "open" | "closed";
      rosterName: string;
      leagueName: string;
      opensAt: Date;
      closesAt: Date;
      maxSeed: number;
      players: SeedingSheetPlayer[];
    }
  | {
      eligible: true;
      status: "finalized";
      rosterName: string;
      leagueName: string;
      finalSeeding: SeedingSheetFinalRow[];
      selfPlayerId: string;
    };

/** What a member sees on their own "Rate players" page — every roster
 * player except themselves, with their own (possibly still-null) seed for
 * each, or the published final order once finalized. Never includes another
 * rater's answers or any average. */
export async function getSeedingSheet(
  rosterId: string,
  userId: string,
  leagueIds: string[] | null
): Promise<SeedingSheet> {
  const eligibility = await getSeedingEligibility(rosterId, userId, leagueIds);
  if (!eligibility.eligible) return eligibility;
  if (!eligibility.window) {
    return { eligible: false, reason: "Rating hasn't been opened for this roster yet" };
  }

  const status = seedingWindowStatus(eligibility.window);
  const rosterInfo = await prisma.playerRoster.findUniqueOrThrow({
    where: { id: rosterId },
    select: { name: true, league: { select: { name: true } } },
  });

  if (status === "finalized") {
    const players = await prisma.player.findMany({
      where: { rosterId, seed: { not: null } },
      orderBy: { seed: "asc" },
      select: { id: true, name: true, position: true, seed: true },
    });
    return {
      eligible: true,
      status: "finalized",
      rosterName: rosterInfo.name,
      leagueName: rosterInfo.league.name,
      selfPlayerId: eligibility.selfPlayerId,
      finalSeeding: players.map((p) => ({
        seed: p.seed!,
        playerId: p.id,
        name: p.name,
        position: p.position,
      })),
    };
  }

  const window = await prisma.playerSeedingWindow.findUniqueOrThrow({ where: { rosterId } });
  const [players, mySubmissions] = await Promise.all([
    prisma.player.findMany({
      where: { rosterId, id: { not: eligibility.selfPlayerId } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, position: true, photoUrl: true },
    }),
    prisma.playerSeedSubmission.findMany({
      where: { windowId: window.id, raterUserId: userId },
      select: { playerId: true, seed: true },
    }),
  ]);
  const mySeedByPlayer = new Map(mySubmissions.map((s) => [s.playerId, s.seed]));

  return {
    eligible: true,
    status: status as "scheduled" | "open" | "closed",
    rosterName: rosterInfo.name,
    leagueName: rosterInfo.league.name,
    opensAt: eligibility.window.opensAt,
    closesAt: eligibility.window.closesAt,
    maxSeed: eligibility.window.maxSeed,
    players: players.map((p) => ({
      playerId: p.id,
      name: p.name,
      position: p.position,
      photoUrl: p.photoUrl,
      positionGroup: groupPosition(p.position),
      mySeed: mySeedByPlayer.get(p.id) ?? null,
    })),
  };
}

/**
 * Saves this rater's full set of seeds for the roster's currently-open
 * window — a complete replace, not a merge, so un-skipping a previously-
 * skipped player (by omitting it from `seeds`) actually removes that row.
 * Deliberately NOT audited: an audit row naming the actor would de-anonymize
 * a submission, defeating the whole point of the feature.
 */
export async function submitSeeds(
  rosterId: string,
  userId: string,
  leagueIds: string[] | null,
  seeds: { playerId: string; seed: number }[]
): Promise<void> {
  const eligibility = await getSeedingEligibility(rosterId, userId, leagueIds);
  if (!eligibility.eligible) throw new ValidationError(eligibility.reason);
  if (!eligibility.window || seedingWindowStatus(eligibility.window) !== "open") {
    throw new InvalidStateTransitionError("Rating isn't open for this roster right now");
  }

  const seenPlayerIds = new Set<string>();
  for (const s of seeds) {
    if (seenPlayerIds.has(s.playerId)) {
      throw new ValidationError("Duplicate player in submission");
    }
    seenPlayerIds.add(s.playerId);
    if (s.playerId === eligibility.selfPlayerId) {
      throw new ValidationError("You can't rate yourself");
    }
    if (!Number.isInteger(s.seed) || s.seed < 1 || s.seed > eligibility.window.maxSeed) {
      throw new ValidationError(`Seed must be a whole number between 1 and ${eligibility.window.maxSeed}`);
    }
  }

  const rosterPlayerIds = new Set(
    (await prisma.player.findMany({ where: { rosterId }, select: { id: true } })).map((p) => p.id)
  );
  for (const s of seeds) {
    if (!rosterPlayerIds.has(s.playerId)) throw new ValidationError("Player not found on this roster");
  }

  const window = await prisma.playerSeedingWindow.findUniqueOrThrow({ where: { rosterId } });

  await prisma.$transaction(async (tx) => {
    await tx.playerSeedSubmission.deleteMany({
      where: {
        windowId: window.id,
        raterUserId: userId,
        playerId: { notIn: seeds.map((s) => s.playerId) },
      },
    });
    for (const s of seeds) {
      await tx.playerSeedSubmission.upsert({
        where: {
          windowId_raterUserId_playerId: { windowId: window.id, raterUserId: userId, playerId: s.playerId },
        },
        create: { windowId: window.id, raterUserId: userId, playerId: s.playerId, seed: s.seed },
        update: { seed: s.seed },
      });
    }
  });
}

export type SeedingSummaryRow = SuggestedSeedRow & {
  name: string;
  position: string | null;
  photoUrl: string | null;
  currentSeed: number | null;
};

export type SeedingSummary = {
  window: { opensAt: Date; closesAt: Date; maxSeed: number; finalizedAt: Date | null } | null;
  status: SeedingWindowStatus | "not-started";
  participation: { submitted: number; eligible: number };
  rows: SeedingSummaryRow[];
};

/**
 * The admin-facing view: suggested order + averages + participation. Never
 * returns a raterUserId, a per-submission timestamp, or anything else that
 * could identify who rated whom — only aggregates.
 */
export async function getSeedingSummary(rosterId: string): Promise<SeedingSummary> {
  const [window, players] = await Promise.all([
    prisma.playerSeedingWindow.findUnique({ where: { rosterId } }),
    prisma.player.findMany({
      where: { rosterId },
      select: { id: true, name: true, position: true, photoUrl: true, seed: true },
    }),
  ]);

  if (!window) {
    return {
      window: null,
      status: "not-started",
      participation: { submitted: 0, eligible: 0 },
      rows: [...players]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p, i) => ({
          playerId: p.id,
          name: p.name,
          position: p.position,
          photoUrl: p.photoUrl,
          currentSeed: p.seed,
          avgSeed: null,
          ratingCount: 0,
          suggestedSeed: i + 1,
          tieGroup: null,
        })),
    };
  }

  const submissions = await prisma.playerSeedSubmission.findMany({
    where: { windowId: window.id },
    select: { raterUserId: true, playerId: true, seed: true },
  });
  const submittedRaterCount = new Set(submissions.map((s) => s.raterUserId)).size;

  // Eligible = active league members whose loginId matches a player on this
  // roster — approximated as active memberships in this league whose
  // loginId matches any roster player with a loginId set.
  const roster = await prisma.playerRoster.findUniqueOrThrow({
    where: { id: rosterId },
    select: { leagueId: true },
  });
  const rosterLoginIds = (
    await prisma.player.findMany({ where: { rosterId, loginId: { not: null } }, select: { loginId: true } })
  ).map((p) => p.loginId!);
  const eligibleCount =
    rosterLoginIds.length === 0
      ? 0
      : await prisma.leagueMembership.count({
          where: {
            leagueId: roster.leagueId,
            isActive: true,
            user: { loginId: { in: rosterLoginIds, mode: "insensitive" } },
          },
        });

  const suggested = computeSuggestedSeeding(
    players.map((p) => ({ playerId: p.id, name: p.name })),
    submissions
  );
  const byId = new Map(players.map((p) => [p.id, p]));

  return {
    window: {
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      maxSeed: window.maxSeed,
      finalizedAt: window.finalizedAt,
    },
    status: seedingWindowStatus(window),
    participation: { submitted: submittedRaterCount, eligible: eligibleCount },
    rows: suggested.map((s) => {
      const p = byId.get(s.playerId)!;
      return { ...s, name: p.name, position: p.position, photoUrl: p.photoUrl, currentSeed: p.seed };
    }),
  };
}

/**
 * Locks in the final seed order (1..N by position in orderedPlayerIds).
 * Only allowed once the window is closed (or already finalized, to allow
 * fixing a mistake) — never while still open or scheduled. Re-finalizing
 * overwrites the previously-published seeds.
 */
export async function finalizeSeeding(
  rosterId: string,
  orderedPlayerIds: string[],
  actorUserId: string
): Promise<void> {
  const roster = await loadRosterWithLeague(rosterId);
  assertLeagueNotReadOnly(roster.league);

  const window = await prisma.playerSeedingWindow.findUnique({ where: { rosterId } });
  if (!window) throw new ValidationError("Rating hasn't been opened for this roster yet");
  const status = seedingWindowStatus(window);
  if (status !== "closed" && status !== "finalized") {
    throw new InvalidStateTransitionError("Seeding can only be finalized once the rating window has closed");
  }

  const rosterPlayers = await prisma.player.findMany({ where: { rosterId }, select: { id: true } });
  const orderedSet = new Set(orderedPlayerIds);
  if (
    orderedPlayerIds.length !== rosterPlayers.length ||
    orderedSet.size !== orderedPlayerIds.length ||
    rosterPlayers.some((p) => !orderedSet.has(p.id))
  ) {
    throw new ValidationError("The finalized order must include every player on the roster exactly once");
  }

  const submissions = await prisma.playerSeedSubmission.findMany({
    where: { windowId: window.id },
    select: { playerId: true, seed: true },
  });
  const suggested = computeSuggestedSeeding(
    rosterPlayers.map((p) => ({ playerId: p.id, name: p.id })),
    submissions
  );
  const tieGroupsInSuggestion = new Set(suggested.map((s) => s.tieGroup).filter((g) => g != null)).size;
  const suggestedOrderById = new Map(suggested.map((s, i) => [s.playerId, i]));
  const deviations = orderedPlayerIds.filter((id, i) => suggestedOrderById.get(id) !== i).length;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedPlayerIds.length; i++) {
      await tx.player.update({ where: { id: orderedPlayerIds[i] }, data: { seed: i + 1 } });
    }
    await tx.playerSeedingWindow.update({
      where: { rosterId },
      data: { finalizedAt: new Date(), finalizedById: actorUserId },
    });
    await writeAuditLog(tx, {
      entityType: "PlayerRoster",
      entityId: rosterId,
      action: "SEEDING_FINALIZED",
      actorUserId,
      after: { playerCount: orderedPlayerIds.length, tieGroupsInSuggestion },
      note: `${deviations} of ${orderedPlayerIds.length} positions differ from the suggested order`,
    });
  });
}
