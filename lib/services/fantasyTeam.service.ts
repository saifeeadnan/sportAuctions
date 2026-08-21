import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import {
  ValidationError,
  InsufficientBudgetError,
  SquadCapExceededError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";
import { assertAuctionLeagueNotReadOnly } from "@/lib/services/league.service";

/** The price a fantasy pick costs: what it actually sold for, or its category
 * base price if it went unsold — the real auction's outcome either way. */
function fantasyPrice(auctionPlayer: {
  status: string;
  soldPrice: Prisma.Decimal | null;
  category: { basePrice: Prisma.Decimal };
}): Prisma.Decimal {
  if (auctionPlayer.status === "SOLD" && auctionPlayer.soldPrice != null) {
    return auctionPlayer.soldPrice;
  }
  return auctionPlayer.category.basePrice;
}

/**
 * The real cap for a fantasy team — not the tournament's configured squad
 * size, but however many players any one real team actually ended up with,
 * which can be lower (e.g. a category went undersold). A team's
 * TeamAuctionEntry.slotsTotal can never exceed the configured squad size, so
 * this is always <= it, never higher.
 */
export async function getMaxRosterSize(auctionId: string): Promise<number> {
  const grouped = await prisma.auctionPlayer.groupBy({
    by: ["soldToEntryId"],
    where: { auctionId, status: "SOLD", soldToEntryId: { not: null } },
    _count: { _all: true },
  });
  return grouped.reduce((max, g) => Math.max(max, g._count._all), 0);
}

/** The viewer's own auction-player entry for this specific auction, if they
 * were part of its pool — this is what guarantees them a spot on their own
 * fantasy team, the same way a manager's own pick is auto-included in the
 * real pre-auction draft. */
async function findSelfAuctionPlayer(auctionId: string, rosterId: string, loginId: string) {
  return prisma.auctionPlayer.findFirst({
    where: {
      auctionId,
      player: { rosterId, loginId: { equals: loginId, mode: "insensitive" } },
    },
  });
}

/** Completed auctions this viewer was actually part of (i.e. eligible for a fantasy team). */
export async function listEligibleCompletedAuctionsForViewer(userId: string, leagueIds: string[] | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.loginId) return [];

  return prisma.auction.findMany({
    where: {
      status: "COMPLETED",
      tournament: leagueIds ? { leagueId: { in: leagueIds } } : undefined,
      auctionPlayers: {
        some: { player: { loginId: { equals: user.loginId, mode: "insensitive" } } },
      },
    },
    include: { tournament: true },
    orderBy: { completedAt: "desc" },
  });
}

export async function getFantasyEligibility(auctionId: string, userId: string, leagueIds: string[] | null) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: { include: { league: true } } },
  });
  if (!auction) return { eligible: false as const, reason: "Auction not found" };
  if (leagueIds !== null && !leagueIds.includes(auction.tournament.leagueId)) {
    return { eligible: false as const, reason: "Auction not found" };
  }
  if (auction.status !== "COMPLETED") {
    return { eligible: false as const, reason: "This auction hasn't completed yet" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.loginId) return { eligible: false as const, reason: "Your account has no login ID" };
  // An auction can only be created once its tournament has a roster
  // attached (see auction.service.ts createAuction), so a COMPLETED
  // auction's tournament always has one — this null check is just to
  // satisfy the type, not a real runtime possibility.
  if (!auction.tournament.rosterId) return { eligible: false as const, reason: "Auction not found" };

  const selfAuctionPlayer = await findSelfAuctionPlayer(
    auctionId,
    auction.tournament.rosterId,
    user.loginId
  );
  if (!selfAuctionPlayer) {
    return {
      eligible: false as const,
      reason: "You weren't part of this auction's player pool, so you can't build a fantasy team for it",
    };
  }

  return { eligible: true as const, auction, selfAuctionPlayerId: selfAuctionPlayer.id };
}

/** All fantasy teams submitted for an auction, for the admin overview. */
export async function listFantasyTeamsForAuction(auctionId: string) {
  return prisma.fantasyTeam.findMany({
    where: { auctionId },
    include: {
      user: true,
      picks: { include: { auctionPlayer: { include: { player: true, category: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

function toRatedPlayer(player: {
  position: string | null;
  rating: unknown;
  battingRating: unknown;
  bowlingRating: unknown;
  fieldingRating: unknown;
}): RatedPlayer {
  return {
    position: player.position,
    rating: player.rating != null ? String(player.rating) : null,
    battingRating: player.battingRating != null ? String(player.battingRating) : null,
    bowlingRating: player.bowlingRating != null ? String(player.bowlingRating) : null,
    fieldingRating: player.fieldingRating != null ? String(player.fieldingRating) : null,
  };
}

/**
 * Ranks every fantasy team submitted for an auction — by total points once the
 * admin has uploaded them, or by computed team strength in the meantime — so
 * both the admin overview and a viewer's own team page show the same standing.
 */
export async function getFantasyStandings(auctionId: string) {
  const [fantasyTeams, pointsUploadedCount] = await Promise.all([
    listFantasyTeamsForAuction(auctionId),
    prisma.auctionPlayer.count({ where: { auctionId, points: { not: null } } }),
  ]);
  const hasPoints = pointsUploadedCount > 0;

  const unranked = fantasyTeams.map((team) => {
    const strength = computeTeamStrength(team.picks.map((p) => toRatedPlayer(p.auctionPlayer.player)));
    const totalSpend = team.picks.reduce((sum, p) => sum + Number(p.price), 0);
    const totalPoints = team.picks.reduce(
      (sum, p) => sum + (p.auctionPlayer.points != null ? Number(p.auctionPlayer.points) : 0),
      0
    );
    const selfPick = team.picks.find(
      (p) => p.auctionPlayer.player.loginId?.toLowerCase() === team.user.loginId?.toLowerCase()
    );
    return { team, strength, totalSpend, totalPoints, selfAuctionPlayerId: selfPick?.auctionPlayerId };
  });

  const standings = unranked
    .sort((a, b) => (hasPoints ? b.totalPoints - a.totalPoints : b.strength.teamStrength - a.strength.teamStrength))
    .map((s, i) => ({ ...s, rank: i + 1 }));

  return { hasPoints, standings };
}

/** The N players picked by the most fantasy teams for this auction, grouped
 * by auction category — a "who's popular" leaderboard per tier, alongside
 * the full standings. Categories with no picks at all are omitted. */
export async function getMostPickedPlayersByCategory(auctionId: string, limit = 5) {
  const [categories, picks] = await Promise.all([
    prisma.auctionCategory.findMany({ where: { auctionId }, orderBy: { basePrice: "desc" } }),
    prisma.fantasyTeamPlayer.findMany({
      where: { fantasyTeam: { auctionId } },
      select: {
        auctionPlayer: {
          select: { categoryId: true, player: { select: { id: true, name: true, position: true } } },
        },
      },
    }),
  ]);

  const countsByCategory = new Map<
    string,
    Map<string, { playerName: string; position: string | null; teamCount: number }>
  >();
  for (const { auctionPlayer } of picks) {
    const { categoryId, player } = auctionPlayer;
    let counts = countsByCategory.get(categoryId);
    if (!counts) {
      counts = new Map();
      countsByCategory.set(categoryId, counts);
    }
    const entry = counts.get(player.id);
    if (entry) entry.teamCount += 1;
    else counts.set(player.id, { playerName: player.name, position: player.position, teamCount: 1 });
  }

  return categories
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      players: Array.from(countsByCategory.get(category.id)?.entries() ?? [])
        .map(([playerId, v]) => ({ playerId, ...v }))
        .sort((a, b) => b.teamCount - a.teamCount || a.playerName.localeCompare(b.playerName))
        .slice(0, limit),
    }))
    .filter((c) => c.players.length > 0);
}

export async function deleteFantasyTeam(fantasyTeamId: string) {
  const { count } = await prisma.fantasyTeam.deleteMany({ where: { id: fantasyTeamId } });
  if (count === 0) {
    throw new ValidationError("Fantasy team not found");
  }
}

export async function getFantasyTeam(auctionId: string, userId: string) {
  return prisma.fantasyTeam.findUnique({
    where: { auctionId_userId: { auctionId, userId } },
    include: {
      picks: { include: { auctionPlayer: { include: { player: true, category: true } } } },
    },
  });
}

/** All auction players available for fantasy picking, priced as they'd cost. */
export async function listFantasyPlayerPool(auctionId: string) {
  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId },
    include: { player: true, category: true },
    orderBy: { player: { name: "asc" } },
  });
  return auctionPlayers.map((ap) => ({
    id: ap.id,
    name: ap.player.name,
    position: ap.player.position,
    photoUrl: ap.player.photoUrl,
    categoryName: ap.category.name,
    status: ap.status,
    price: fantasyPrice(ap).toString(),
    rating: ap.player.rating != null ? String(ap.player.rating) : null,
    battingRating: ap.player.battingRating != null ? String(ap.player.battingRating) : null,
    bowlingRating: ap.player.bowlingRating != null ? String(ap.player.bowlingRating) : null,
    fieldingRating: ap.player.fieldingRating != null ? String(ap.player.fieldingRating) : null,
  }));
}

/** A fantasy team is freely editable up until its lock date — past that
 * point, whatever was last saved becomes final automatically (no explicit
 * "lock" action needed, and nothing needs to run at the deadline itself:
 * `submitFantasyTeam` just starts rejecting further edits). `fantasyLockDate`
 * is an Admin/League-Admin-editable override; when unset, this falls back
 * to the tournament's own startDate — the original, always-on behavior. */
export function isFantasyEditingLocked(auction: {
  fantasyLockDate: Date | null;
  tournament: { startDate: Date };
}): boolean {
  return new Date() >= (auction.fantasyLockDate ?? auction.tournament.startDate);
}

/** Admin/League-Admin-only: set (or clear, via `null`) the override that
 * decides when this auction's fantasy picks finalize. Editable any time,
 * not write-once — unlike auction settings locked in at creation, there's
 * no cross-cutting cascade to worry about here, just a date comparison. */
export async function updateFantasyLockDate(auctionId: string, fantasyLockDate: Date | null) {
  if (fantasyLockDate != null && Number.isNaN(fantasyLockDate.getTime())) {
    throw new ValidationError("Invalid date");
  }
  await assertAuctionLeagueNotReadOnly(auctionId);
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");

  return prisma.auction.update({ where: { id: auctionId }, data: { fantasyLockDate } });
}

export async function submitFantasyTeam(
  auctionId: string,
  userId: string,
  auctionPlayerIds: string[],
  leagueIds: string[] | null,
  name?: string
) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (leagueIds !== null && !leagueIds.includes(auction.tournament.leagueId)) {
    throw new ValidationError("Auction not found");
  }
  if (auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError(
      "Fantasy teams can only be built once the auction is completed"
    );
  }
  if (isFantasyEditingLocked(auction)) {
    throw new InvalidStateTransitionError(
      "Fantasy team picks are locked and can no longer be changed"
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.loginId) throw new ValidationError("Your account has no login ID");
  // Same invariant as getFantasyEligibility above — a COMPLETED auction's
  // tournament always has a roster attached.
  if (!auction.tournament.rosterId) throw new ValidationError("Auction not found");

  const selfAuctionPlayer = await findSelfAuctionPlayer(
    auctionId,
    auction.tournament.rosterId,
    user.loginId
  );
  if (!selfAuctionPlayer) {
    throw new ValidationError("You weren't part of this auction's player pool");
  }

  // You're always on your own fantasy team, whether or not the client sent your
  // own pick — this only ever fills one of the total squad slots, same as a
  // manager's own guaranteed pick in the real pre-auction draft.
  const uniqueIds = new Set(auctionPlayerIds);
  uniqueIds.add(selfAuctionPlayer.id);

  const idsArray = Array.from(uniqueIds);
  const maxRosterSize = await getMaxRosterSize(auctionId);
  if (idsArray.length > maxRosterSize) {
    throw new SquadCapExceededError(`A fantasy team cannot exceed ${maxRosterSize} player(s)`);
  }

  const players = await prisma.auctionPlayer.findMany({
    where: { id: { in: idsArray }, auctionId },
    include: { category: true },
  });
  if (players.length !== idsArray.length) {
    throw new ValidationError("One or more selected players are not part of this auction");
  }
  // Nobody actually acquired an unsold player, so there's no real-world team
  // for them to represent — the guaranteed self-pick is exempt, matching how
  // it's already force-included above regardless of status.
  const unsoldPicks = players.filter((ap) => ap.status !== "SOLD" && ap.id !== selfAuctionPlayer.id);
  if (unsoldPicks.length > 0) {
    throw new ValidationError("Unsold players can't be picked for a fantasy team");
  }

  const totalPrice = players.reduce(
    (sum, ap) => sum.plus(fantasyPrice(ap)),
    new Prisma.Decimal(0)
  );
  if (totalPrice.greaterThan(auction.teamBudget)) {
    throw new InsufficientBudgetError(
      `Total price of selected players (${totalPrice.toString()}) exceeds the budget (${auction.teamBudget.toString()})`
    );
  }

  // Empty/whitespace-only input clears a previously-set name rather than
  // persisting an empty string — same "optional, trimmed" convention as
  // every other user-provided display name in this codebase.
  const trimmedName = name?.trim() || null;

  // Re-submittable: upsert the team row (keeping its id/createdAt stable
  // across edits) and replace its picks wholesale, same delete-then-recreate
  // pattern the manager pre-auction draft already uses for its own
  // keep-editing-until-locked flow (see preAuctionDraft.service.ts's submitDraft).
  return prisma.$transaction(async (tx) => {
    const fantasyTeam = await tx.fantasyTeam.upsert({
      where: { auctionId_userId: { auctionId, userId } },
      create: { auctionId, userId, name: trimmedName },
      update: { name: trimmedName },
    });
    await tx.fantasyTeamPlayer.deleteMany({ where: { fantasyTeamId: fantasyTeam.id } });
    await tx.fantasyTeamPlayer.createMany({
      data: players.map((ap) => ({
        fantasyTeamId: fantasyTeam.id,
        auctionPlayerId: ap.id,
        price: fantasyPrice(ap),
      })),
    });
    return tx.fantasyTeam.findUniqueOrThrow({
      where: { id: fantasyTeam.id },
      include: {
        picks: { include: { auctionPlayer: { include: { player: true, category: true } } } },
      },
    });
  });
}
