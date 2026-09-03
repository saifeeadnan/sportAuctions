import { prisma } from "@/lib/prisma";
import { Prisma, FantasyPricingModel } from "@/app/generated/prisma/client";
import {
  ValidationError,
  InsufficientBudgetError,
  SquadCapExceededError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import { computeTeamStrength, type RatedPlayer } from "@/lib/teamStrength";
import { assertAuctionLeagueNotReadOnly } from "@/lib/services/league.service";

type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

/** Average soldPrice across every SOLD player in each category, this
 * auction — the basis for CATEGORY_AVERAGE pricing and for pricing any
 * "selected by default" self-pick (which always uses this, regardless of
 * the auction's own pricing model). A category with zero SOLD players has
 * no average; callers fall back to that category's basePrice. Takes an
 * explicit client so a caller running inside a transaction (a correction's
 * cascade, a settings change) reads that transaction's own snapshot rather
 * than a stale value from outside it. */
async function computeCategoryAveragePrices(
  auctionId: string,
  client: PrismaClientOrTx
): Promise<Map<string, Prisma.Decimal>> {
  const grouped = await client.auctionPlayer.groupBy({
    by: ["categoryId"],
    where: { auctionId, status: "SOLD", soldPrice: { not: null } },
    _avg: { soldPrice: true },
  });
  return new Map(
    grouped
      .filter((g) => g._avg.soldPrice != null)
      .map((g) => [g.categoryId, g._avg.soldPrice!.toDecimalPlaces(2)])
  );
}

/** The price a fantasy pick costs. A player "selected by default" (the
 * force-included self-pick, only possible when fantasySelfPickRequired is
 * true) always costs their category's average — regardless of whether they
 * were actually sold, and regardless of the auction's own pricing model —
 * since a guaranteed pick isn't really a value judgment the way a freely
 * chosen one is. Everyone else follows the auction's chosen pricingModel:
 * either the real sold price (or category basePrice if unsold), or the
 * category average for every pick alike. Either way, a category with no
 * SOLD players at all has no average to fall back to, so it falls back
 * further to basePrice. */
function fantasyPrice(
  auctionPlayer: {
    status: string;
    soldPrice: Prisma.Decimal | null;
    categoryId: string;
    category: { basePrice: Prisma.Decimal };
  },
  context: {
    pricingModel: FantasyPricingModel;
    categoryAverages: Map<string, Prisma.Decimal>;
    isSelfPick: boolean;
  }
): Prisma.Decimal {
  if (context.isSelfPick || context.pricingModel === "CATEGORY_AVERAGE") {
    return context.categoryAverages.get(auctionPlayer.categoryId) ?? auctionPlayer.category.basePrice;
  }
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
 * fantasy team (when fantasySelfPickRequired), the same way a manager's own
 * pick is auto-included in the real pre-auction draft. Accepts an explicit
 * client so callers running inside a transaction (repriceFantasyTeamPlayers)
 * read that transaction's own snapshot. */
async function findSelfAuctionPlayer(
  auctionId: string,
  rosterId: string,
  loginId: string,
  client: PrismaClientOrTx = prisma
) {
  return client.auctionPlayer.findFirst({
    where: {
      auctionId,
      player: { rosterId, loginId: { equals: loginId, mode: "insensitive" } },
    },
  });
}

/** True when this user's role in the auction's own league is TEAM_MANAGER
 * and the auction hasn't opted into fantasyManagersAllowed — fantasy teams
 * default to a viewer/spectator feature. Queries LeagueMembership fresh
 * rather than trusting a caller-supplied role, since the functions that use
 * this (getFantasyEligibility, submitFantasyTeam) only ever receive a
 * userId, never a session. Scoped to the auction's specific league — a user
 * who's TEAM_MANAGER in some other league is unaffected here. */
async function isManagerBlocked(userId: string, leagueId: string, managersAllowed: boolean): Promise<boolean> {
  if (managersAllowed) return false;
  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  return membership?.role === "TEAM_MANAGER";
}

/** Completed auctions this viewer is eligible to build a fantasy team for —
 * either they were actually part of its player pool (the usual case), or
 * the auction has fantasySelfPickRequired turned off, in which case being
 * in the pool isn't required at all and every in-league viewer/manager is
 * eligible. Deliberately doesn't early-return on a missing loginId: a user
 * with none can still see/use an open (fantasySelfPickRequired: false)
 * auction, so the loginId-based branch of the OR is just omitted for them
 * rather than short-circuiting the whole function. Separately, a TEAM_MANAGER
 * is excluded unless fantasyManagersAllowed is on for that auction — same
 * rule as isManagerBlocked, expressed as a query filter instead of a
 * per-auction lookup, since this lists many auctions at once. */
export async function listEligibleCompletedAuctionsForViewer(userId: string, leagueIds: string[] | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  return prisma.auction.findMany({
    where: {
      status: "COMPLETED",
      tournament: leagueIds ? { leagueId: { in: leagueIds } } : undefined,
      OR: [
        user?.loginId
          ? { auctionPlayers: { some: { player: { loginId: { equals: user.loginId, mode: "insensitive" as const } } } } }
          : undefined,
        { fantasySelfPickRequired: false },
      ].filter(Boolean) as Prisma.AuctionWhereInput[],
      AND: [
        {
          OR: [
            { fantasyManagersAllowed: true },
            { tournament: { league: { memberships: { none: { userId, role: "TEAM_MANAGER" } } } } },
          ],
        },
      ],
    },
    include: { tournament: true },
    orderBy: { completedAt: "desc" },
  });
}

export type FantasyEligibilityOverviewItem = {
  auctionId: string;
  auctionName: string;
  tournamentName: string;
  submitted: boolean;
};

/** Mobile-only overview list: every completed auction this viewer is
 * eligible to build a fantasy team for, plus whether they already have.
 * Mirrors app/viewer/fantasy/page.tsx's own data fetch (eligible auctions +
 * a submitted-check), just moved into the service layer for reuse. */
export async function listFantasyEligibilityOverview(
  userId: string,
  leagueIds: string[] | null
): Promise<FantasyEligibilityOverviewItem[]> {
  const auctions = await listEligibleCompletedAuctionsForViewer(userId, leagueIds);
  if (auctions.length === 0) return [];

  const submitted = await prisma.fantasyTeam.findMany({
    where: { userId, auctionId: { in: auctions.map((a) => a.id) } },
    select: { auctionId: true },
  });
  const submittedIds = new Set(submitted.map((s) => s.auctionId));

  return auctions.map((a) => ({
    auctionId: a.id,
    auctionName: a.name,
    tournamentName: a.tournament.name,
    submitted: submittedIds.has(a.id),
  }));
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
  if (await isManagerBlocked(userId, auction.tournament.leagueId, auction.fantasyManagersAllowed)) {
    return { eligible: false as const, reason: "Team managers can't build a fantasy team for this auction" };
  }

  // The loginId requirement is scoped to "needed to attempt a self-match,"
  // not "needed to use the feature at all" — a user with no loginId can
  // still be eligible when fantasySelfPickRequired is off.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  let selfAuctionPlayerId: string | null = null;
  if (user?.loginId && auction.tournament.rosterId) {
    const self = await findSelfAuctionPlayer(auctionId, auction.tournament.rosterId, user.loginId);
    selfAuctionPlayerId = self?.id ?? null;
  }

  if (auction.fantasySelfPickRequired) {
    if (!user?.loginId) return { eligible: false as const, reason: "Your account has no login ID" };
    if (!selfAuctionPlayerId) {
      return {
        eligible: false as const,
        reason: "You weren't part of this auction's player pool, so you can't build a fantasy team for it",
      };
    }
  }

  return { eligible: true as const, auction, selfAuctionPlayerId };
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

/** `ownerUserId` given: only deletes if it's also owned by that user (viewer
 * self-service delete). Omitted: deletes by id alone (existing admin path). */
export async function deleteFantasyTeam(fantasyTeamId: string, ownerUserId?: string) {
  const { count } = await prisma.fantasyTeam.deleteMany({
    where: { id: fantasyTeamId, ...(ownerUserId ? { userId: ownerUserId } : {}) },
  });
  if (count === 0) {
    throw new ValidationError("Fantasy team not found");
  }
}

/** Every fantasy team a user has for one auction — plural now that
 * Auction.fantasyMaxTeamsPerUser can be >1 (FantasyTeam's unique constraint
 * on [auctionId, userId] was relaxed to a plain index for exactly this). */
export async function listMyFantasyTeams(auctionId: string, userId: string) {
  return prisma.fantasyTeam.findMany({
    where: { auctionId, userId },
    include: {
      picks: { include: { auctionPlayer: { include: { player: true, category: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** All auction players available for fantasy picking, priced as they'd cost
 * for this specific viewer — `selfAuctionPlayerId` (their own force-included
 * pick, if any and if required) prices differently from everyone else, so
 * the pool is inherently viewer-specific, not a single shared price list. */
export async function listFantasyPlayerPool(
  auctionId: string,
  pricingModel: FantasyPricingModel,
  selfAuctionPlayerId: string | null
) {
  const [auctionPlayers, categoryAverages] = await Promise.all([
    prisma.auctionPlayer.findMany({
      where: { auctionId },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
    computeCategoryAveragePrices(auctionId, prisma),
  ]);
  return auctionPlayers.map((ap) => ({
    id: ap.id,
    name: ap.player.name,
    position: ap.player.position,
    photoUrl: ap.player.photoUrl,
    categoryName: ap.category.name,
    status: ap.status,
    price: fantasyPrice(ap, {
      pricingModel,
      categoryAverages,
      isSelfPick: ap.id === selfAuctionPlayerId,
    }).toString(),
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

/** Recomputes and overwrites every FantasyTeamPlayer.price in this auction
 * from scratch, using the auction's current settings — the single place
 * "existing snapshots are now stale, bring them back in sync" lives. Called
 * from two places: a sold-price/category-base-price correction (the
 * category average shifting, or a self-pick's stale sold-price snapshot,
 * both need every affected pick repriced, not just the one player's own
 * row), and updateFantasySettings when the pricing model itself changes.
 * Always takes an explicit transaction client — never defaults to the
 * top-level `prisma` — so it's never possible to accidentally read/write
 * outside the caller's own transaction snapshot. Self-pick status is
 * resolved per team (per user), since it's who's on the team that decides
 * it, not anything about the auction as a whole. */
export async function repriceFantasyTeamPlayers(auctionId: string, tx: Prisma.TransactionClient): Promise<void> {
  const auction = await tx.auction.findUniqueOrThrow({
    where: { id: auctionId },
    include: { tournament: true },
  });
  const categoryAverages = await computeCategoryAveragePrices(auctionId, tx);
  const teams = await tx.fantasyTeam.findMany({
    where: { auctionId },
    include: { user: true, picks: { include: { auctionPlayer: { include: { category: true } } } } },
  });

  for (const team of teams) {
    let selfAuctionPlayerId: string | null = null;
    if (auction.fantasySelfPickRequired && team.user.loginId && auction.tournament.rosterId) {
      const self = await findSelfAuctionPlayer(auctionId, auction.tournament.rosterId, team.user.loginId, tx);
      selfAuctionPlayerId = self?.id ?? null;
    }
    for (const pick of team.picks) {
      const price = fantasyPrice(pick.auctionPlayer, {
        pricingModel: auction.fantasyPricingModel,
        categoryAverages,
        isSelfPick: pick.auctionPlayerId === selfAuctionPlayerId,
      });
      await tx.fantasyTeamPlayer.update({ where: { id: pick.id }, data: { price } });
    }
  }
}

/** Admin/League-Admin-only: the four fantasy configuration knobs for an
 * auction. Editable any time, not write-once, same posture as
 * updateFantasyLockDate — lets an admin pre-configure at auction creation
 * time, not just after it concludes. Lowering maxTeamsPerUser below
 * someone's current team count, or turning managersAllowed off after
 * managers already have teams, is intentionally allowed and never touches
 * existing rows — same "only future create/edit attempts are checked
 * against the current setting" convention as updateLeagueSettings's
 * cap-lowering. */
export async function updateFantasySettings(
  auctionId: string,
  input: {
    pricingModel?: FantasyPricingModel;
    selfPickRequired?: boolean;
    maxTeamsPerUser?: number;
    managersAllowed?: boolean;
  }
) {
  await assertAuctionLeagueNotReadOnly(auctionId);
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (
    input.maxTeamsPerUser !== undefined &&
    (!Number.isInteger(input.maxTeamsPerUser) || input.maxTeamsPerUser < 1)
  ) {
    throw new ValidationError("Max teams per user must be at least 1");
  }

  const data = {
    fantasyPricingModel: input.pricingModel ?? auction.fantasyPricingModel,
    fantasySelfPickRequired: input.selfPickRequired ?? auction.fantasySelfPickRequired,
    fantasyMaxTeamsPerUser: input.maxTeamsPerUser ?? auction.fantasyMaxTeamsPerUser,
    fantasyManagersAllowed: input.managersAllowed ?? auction.fantasyManagersAllowed,
  };

  // Flipping the pricing model leaves every existing FantasyTeamPlayer.price
  // stale until something else happens to touch it — reprice immediately,
  // in the same transaction as the setting change, rather than leaving
  // different teams priced under different models depending on when they
  // last happened to resubmit.
  const pricingModelChanged =
    input.pricingModel !== undefined && input.pricingModel !== auction.fantasyPricingModel;
  if (pricingModelChanged) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.auction.update({ where: { id: auctionId }, data });
      await repriceFantasyTeamPlayers(auctionId, tx);
      return updated;
    });
  }
  return prisma.auction.update({ where: { id: auctionId }, data });
}

/**
 * Creates or edits one of a user's fantasy teams for an auction.
 *
 * `fantasyTeamId` decides which: **omitted always means "create a new
 * team"** (subject to the fantasyMaxTeamsPerUser cap); **provided means
 * "edit this specific team"** (ownership-verified, never subject to the cap
 * since it isn't a new team). This is a deliberate contract every caller
 * must respect — omitting it on what the user intends as an edit would get
 * silently treated as a new-team attempt and rejected once at the cap,
 * instead of updating their existing team.
 */
export async function submitFantasyTeam(
  auctionId: string,
  userId: string,
  auctionPlayerIds: string[],
  leagueIds: string[] | null,
  name?: string,
  fantasyTeamId?: string
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
  if (await isManagerBlocked(userId, auction.tournament.leagueId, auction.fantasyManagersAllowed)) {
    throw new ValidationError("Team managers can't build a fantasy team for this auction");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  let existingTeamId: string | null = null;
  if (fantasyTeamId) {
    const existing = await prisma.fantasyTeam.findFirst({
      where: { id: fantasyTeamId, auctionId, userId },
    });
    if (!existing) throw new ValidationError("Fantasy team not found");
    existingTeamId = existing.id;
  } else {
    const existingCount = await prisma.fantasyTeam.count({ where: { auctionId, userId } });
    if (existingCount >= auction.fantasyMaxTeamsPerUser) {
      throw new SquadCapExceededError(
        `You can have at most ${auction.fantasyMaxTeamsPerUser} fantasy team(s) for this auction`
      );
    }
  }

  // A self-match is still looked up whenever possible (needed either way to
  // price/highlight "you" on the roster), but only REQUIRED — and only
  // force-included/exempted from the unsold-picks rule — when the auction's
  // fantasySelfPickRequired setting is on.
  let selfAuctionPlayer: Awaited<ReturnType<typeof findSelfAuctionPlayer>> = null;
  if (user?.loginId && auction.tournament.rosterId) {
    selfAuctionPlayer = await findSelfAuctionPlayer(auctionId, auction.tournament.rosterId, user.loginId);
  }
  if (auction.fantasySelfPickRequired) {
    if (!user?.loginId) throw new ValidationError("Your account has no login ID");
    if (!selfAuctionPlayer) throw new ValidationError("You weren't part of this auction's player pool");
  }
  const forcedSelfId = auction.fantasySelfPickRequired ? selfAuctionPlayer?.id : undefined;

  // When required, you're always on your own fantasy team, whether or not
  // the client sent your own pick — this only ever fills one of the total
  // squad slots, same as a manager's own guaranteed pick in the real
  // pre-auction draft. When not required, no player is force-added.
  const uniqueIds = new Set(auctionPlayerIds);
  if (forcedSelfId) uniqueIds.add(forcedSelfId);

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
  // for them to represent — the guaranteed self-pick is exempt (only when
  // self-pick is actually required; otherwise an unsold self-match is just
  // a normal pick, and normal picks can never be unsold).
  const unsoldPicks = players.filter((ap) => ap.status !== "SOLD" && ap.id !== forcedSelfId);
  if (unsoldPicks.length > 0) {
    throw new ValidationError("Unsold players can't be picked for a fantasy team");
  }

  const categoryAverages = await computeCategoryAveragePrices(auctionId, prisma);
  const priceFor = (ap: (typeof players)[number]) =>
    fantasyPrice(ap, {
      pricingModel: auction.fantasyPricingModel,
      categoryAverages,
      isSelfPick: ap.id === forcedSelfId,
    });

  const totalPrice = players.reduce((sum, ap) => sum.plus(priceFor(ap)), new Prisma.Decimal(0));
  if (totalPrice.greaterThan(auction.teamBudget)) {
    throw new InsufficientBudgetError(
      `Total price of selected players (${totalPrice.toString()}) exceeds the budget (${auction.teamBudget.toString()})`
    );
  }

  // Empty/whitespace-only input clears a previously-set name rather than
  // persisting an empty string — same "optional, trimmed" convention as
  // every other user-provided display name in this codebase.
  const trimmedName = name?.trim() || null;

  // Re-submittable: create-or-update the team row (keeping its id/createdAt
  // stable across edits when editing) and replace its picks wholesale, same
  // delete-then-recreate pattern the manager pre-auction draft already uses
  // for its own keep-editing-until-locked flow (see
  // preAuctionDraft.service.ts's submitDraft).
  return prisma.$transaction(async (tx) => {
    const fantasyTeam = existingTeamId
      ? await tx.fantasyTeam.update({ where: { id: existingTeamId }, data: { name: trimmedName } })
      : await tx.fantasyTeam.create({ data: { auctionId, userId, name: trimmedName } });
    await tx.fantasyTeamPlayer.deleteMany({ where: { fantasyTeamId: fantasyTeam.id } });
    await tx.fantasyTeamPlayer.createMany({
      data: players.map((ap) => ({
        fantasyTeamId: fantasyTeam.id,
        auctionPlayerId: ap.id,
        price: priceFor(ap),
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
