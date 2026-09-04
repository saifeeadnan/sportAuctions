import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import {
  ValidationError,
  InsufficientBudgetError,
  InvalidStateTransitionError,
  SquadCapExceededError,
} from "@/lib/errors";
import { computeManagerSlotPrice } from "@/lib/services/budget.service";
import { assertLeagueNotReadOnly, assertAuctionLeagueNotReadOnly } from "@/lib/services/league.service";
import { resolveOverlaps } from "@/lib/services/overlapResolution.service";
import { findManagerSelfAuctionPlayerId } from "@/lib/services/preAuctionDraft.service";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import { emitAuctionEvent } from "@/server/ws/broadcaster";
import { type AuctionType, IMPLEMENTED_AUCTION_TYPES, AUCTION_TYPE_LABELS } from "@/lib/auctionTypes";
import {
  ON_CLOCK_TEMPLATES,
  ON_CLOCK_FIELD_KEYS,
  DEFAULT_ON_CLOCK_VISIBLE_FIELDS,
  type OnClockTemplate,
  type OnClockFieldKey,
} from "@/lib/onClockDisplay";

export type CreateAuctionInput = {
  tournamentId: string;
  name: string;
  teamBudget: number;
  createdById: string;
  auctionType?: AuctionType;
  skipPreAuctionDraft?: boolean;
  onClockTemplate?: OnClockTemplate;
  onClockVisibleFields?: OnClockFieldKey[];
  lotTimerSeconds?: number;
  reAuctionEnabled?: boolean;
  reAuctionDiscountPercent?: number;
  categories: {
    name: string;
    basePrice: number;
    preAuctionEligible?: boolean;
    bidIncrement?: number;
  }[];
  playerAssignments: { playerId: string; categoryName: string }[];
};

/** Shared between createAuction and updateOnClockDisplaySettings — both take
 * the same two optional settings and need the same validation against
 * lib/onClockDisplay.ts's fixed lists. */
function validateOnClockDisplayInput(input: {
  onClockTemplate?: string;
  onClockVisibleFields?: string[];
}) {
  if (input.onClockTemplate != null && !ON_CLOCK_TEMPLATES.includes(input.onClockTemplate as OnClockTemplate)) {
    throw new ValidationError(`Unknown on-the-clock template "${input.onClockTemplate}"`);
  }
  if (input.onClockVisibleFields != null) {
    const invalid = input.onClockVisibleFields.filter(
      (f) => !ON_CLOCK_FIELD_KEYS.includes(f as OnClockFieldKey)
    );
    if (invalid.length > 0) {
      throw new ValidationError(`Unknown display field(s): ${invalid.join(", ")}`);
    }
  }
}

/** Both settings are write-once at auction creation — no settings-page
 * editor exists for either, unlike the on-clock display settings. */
function validateBiddingMechanicsInput(input: {
  lotTimerSeconds?: number | null;
  reAuctionEnabled: boolean;
  reAuctionDiscountPercent?: number | null;
}) {
  if (input.lotTimerSeconds != null) {
    if (!Number.isInteger(input.lotTimerSeconds) || input.lotTimerSeconds < 3 || input.lotTimerSeconds > 600) {
      throw new ValidationError("Lot timer must be a whole number of seconds between 3 and 600");
    }
  }
  if (input.reAuctionEnabled) {
    if (
      input.reAuctionDiscountPercent == null ||
      !Number.isInteger(input.reAuctionDiscountPercent) ||
      input.reAuctionDiscountPercent < 1 ||
      input.reAuctionDiscountPercent > 99
    ) {
      throw new ValidationError(
        "Re-auction discount percent must be a whole number between 1 and 99 when re-auction is enabled"
      );
    }
  }
}

export async function createAuction(input: CreateAuctionInput) {
  if (!input.name.trim()) throw new ValidationError("Auction name is required");
  if (input.teamBudget <= 0) throw new ValidationError("Team budget must be greater than 0");
  if (input.categories.length === 0) throw new ValidationError("At least one category is required");

  const auctionType = input.auctionType ?? "LIVE";
  if (!IMPLEMENTED_AUCTION_TYPES.includes(auctionType)) {
    throw new ValidationError(
      `${AUCTION_TYPE_LABELS[auctionType]} isn't supported yet — choose Live Auction`
    );
  }

  const skipPreAuctionDraft = input.skipPreAuctionDraft ?? false;
  const onClockTemplate = input.onClockTemplate ?? "CLASSIC";
  const onClockVisibleFields = input.onClockVisibleFields ?? DEFAULT_ON_CLOCK_VISIBLE_FIELDS;
  validateOnClockDisplayInput({ onClockTemplate, onClockVisibleFields });

  const lotTimerSeconds = input.lotTimerSeconds ?? null;
  const reAuctionEnabled = input.reAuctionEnabled ?? false;
  const reAuctionDiscountPercent = reAuctionEnabled ? (input.reAuctionDiscountPercent ?? null) : null;
  validateBiddingMechanicsInput({ lotTimerSeconds, reAuctionEnabled, reAuctionDiscountPercent });

  const categoryNames = new Set(input.categories.map((c) => c.name.trim()));
  if (categoryNames.size !== input.categories.length) {
    throw new ValidationError("Category names must be unique");
  }
  for (const cat of input.categories) {
    if (cat.basePrice <= 0) {
      throw new ValidationError(`Category "${cat.name}" must have a base price greater than 0`);
    }
    if (cat.bidIncrement != null && cat.bidIncrement <= 0) {
      throw new ValidationError(`Category "${cat.name}"'s bid increment must be greater than 0`);
    }
  }

  if (input.playerAssignments.length === 0) {
    throw new ValidationError("At least one player must be added to the auction pool");
  }
  for (const pa of input.playerAssignments) {
    if (!categoryNames.has(pa.categoryName)) {
      throw new ValidationError(`Unknown category "${pa.categoryName}" for player assignment`);
    }
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    include: { league: true },
  });
  if (!tournament) throw new ValidationError("Tournament not found");
  assertLeagueNotReadOnly(tournament.league);
  if (!tournament.rosterId) {
    throw new ValidationError("Attach a player roster to this tournament before creating an auction");
  }

  const rosterPlayerIds = new Set(
    (await prisma.player.findMany({
      where: { rosterId: tournament.rosterId },
      select: { id: true },
    })).map((p) => p.id)
  );
  for (const pa of input.playerAssignments) {
    if (!rosterPlayerIds.has(pa.playerId)) {
      throw new ValidationError("A selected player does not belong to this tournament's roster");
    }
  }

  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.create({
      data: {
        tournamentId: input.tournamentId,
        name: input.name.trim(),
        teamBudget: input.teamBudget,
        auctionType,
        createdById: input.createdById,
        skipPreAuctionDraft,
        onClockTemplate,
        onClockVisibleFields,
        lotTimerSeconds,
        reAuctionEnabled,
        reAuctionDiscountPercent,
      },
    });

    const createdCategories = await Promise.all(
      input.categories.map((c) =>
        tx.auctionCategory.create({
          data: {
            auctionId: auction.id,
            name: c.name.trim(),
            basePrice: c.basePrice,
            preAuctionEligible: c.preAuctionEligible ?? true,
            bidIncrement: c.bidIncrement ?? null,
          },
        })
      )
    );
    const categoryIdByName = new Map(createdCategories.map((c) => [c.name, c.id]));

    await tx.auctionPlayer.createMany({
      data: input.playerAssignments.map((pa) => ({
        auctionId: auction.id,
        playerId: pa.playerId,
        categoryId: categoryIdByName.get(pa.categoryName.trim())!,
      })),
    });

    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auction.id,
      auctionId: auction.id,
      action: "AUCTION_CREATED",
      actorUserId: input.createdById,
      after: {
        name: auction.name,
        teamBudget: auction.teamBudget.toString(),
        auctionType,
        categoryCount: input.categories.length,
        playerCount: input.playerAssignments.length,
      },
    });

    return auction;
  });
}

/**
 * Adds a roster player into an already-created auction's pool — the only way
 * a player joins an auction otherwise is the fixed set chosen at
 * createAuction time, so a player added to the roster afterward (or left out
 * by mistake) would never appear no matter how many times the live pages are
 * refreshed. Always joins as AVAILABLE, same as every player createAuction
 * itself creates.
 */
export async function addPlayerToAuction(
  auctionId: string,
  playerId: string,
  categoryId: string,
  actorUserId: string
) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status === "COMPLETED") {
    throw new InvalidStateTransitionError("Cannot add a player to a completed auction");
  }

  const category = await prisma.auctionCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.auctionId !== auctionId) {
    throw new ValidationError("Category does not belong to this auction");
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) throw new ValidationError("Player not found");
  if (player.rosterId !== auction.tournament.rosterId) {
    throw new ValidationError("Player does not belong to this tournament's roster");
  }

  const existing = await prisma.auctionPlayer.findUnique({
    where: { auctionId_playerId: { auctionId, playerId } },
  });
  if (existing) throw new ValidationError("This player is already in the auction's pool");

  return prisma.$transaction(async (tx) => {
    const created = await tx.auctionPlayer.create({
      data: { auctionId, playerId, categoryId },
    });
    await writeAuditLog(tx, {
      entityType: "AuctionPlayer",
      entityId: created.id,
      auctionId,
      action: "AUCTION_PLAYER_ADDED",
      actorUserId,
      after: { playerName: player.name, categoryName: category.name },
    });
    return created;
  });
}

/**
 * Moves an auction player to a different category of the same auction.
 * AuctionPlayer.categoryId is a one-time snapshot taken when the player
 * joins the pool (at createAuction or addPlayerToAuction) — Player.category
 * (a roster-level field, only ever read as a pre-fill suggestion when
 * building that snapshot) has no live link to it afterward, so editing the
 * roster never changes it. Blocked once bidding or a sale has actually
 * happened against the player, since the current bid/sale amount was
 * validated against the old category's base price and increment.
 */
export async function updateAuctionPlayerCategory(
  auctionId: string,
  auctionPlayerId: string,
  categoryId: string,
  actorUserId: string
) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auctionPlayer = await prisma.auctionPlayer.findUnique({
    where: { id: auctionPlayerId },
    include: { category: true },
  });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status === "SOLD" || auctionPlayer.status === "IN_BIDDING") {
    throw new InvalidStateTransitionError(
      `Cannot change category while player status is ${auctionPlayer.status}`
    );
  }

  const category = await prisma.auctionCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.auctionId !== auctionId) {
    throw new ValidationError("Category does not belong to this auction");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: { categoryId },
    });
    await writeAuditLog(tx, {
      entityType: "AuctionPlayer",
      entityId: auctionPlayerId,
      auctionId,
      action: "AUCTION_PLAYER_CATEGORY_CHANGED",
      actorUserId,
      before: { categoryName: auctionPlayer.category.name },
      after: { categoryName: category.name },
    });
    return updated;
  });
}

export async function updateCategoryBidIncrement(
  categoryId: string,
  bidIncrement: number | null,
  actorUserId: string
) {
  if (bidIncrement != null && bidIncrement <= 0) {
    throw new ValidationError("Bid increment must be greater than 0");
  }

  const category = await prisma.auctionCategory.findUnique({
    where: { id: categoryId },
    include: { auction: true },
  });
  if (!category) throw new ValidationError("Category not found");
  await assertAuctionLeagueNotReadOnly(category.auctionId);

  // Only blocked while a player is actually on the clock — a bid increment
  // is read fresh at the moment each bid is placed, not baked into any
  // stored balance, so it's safe to change between players even while the
  // auction's own status stays "BIDDING" for the whole live session.
  const playerOnClock = await prisma.auctionPlayer.findFirst({
    where: { auctionId: category.auctionId, status: "IN_BIDDING" },
  });
  if (playerOnClock) {
    throw new InvalidStateTransitionError(
      "Cannot change a bid increment while a player is on the clock — wait until the current sale is resolved"
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.auctionCategory.update({
      where: { id: categoryId },
      data: { bidIncrement },
    });
    await writeAuditLog(tx, {
      entityType: "AuctionCategory",
      entityId: categoryId,
      auctionId: category.auctionId,
      action: "CATEGORY_BID_INCREMENT_CHANGED",
      actorUserId,
      before: { bidIncrement: category.bidIncrement?.toString() ?? null },
      after: { bidIncrement: bidIncrement?.toString() ?? null },
    });
    return updated;
  });
}

type AuctionForEntryPlanning = Prisma.AuctionGetPayload<{
  include: { tournament: { include: { teams: true } } };
}>;

type TeamEntryPlan = {
  teamId: string;
  budgetRemaining: Prisma.Decimal;
  slotsFilled: number;
  slotsTotal: number;
};

/**
 * Computes each team's starting TeamAuctionEntry values — self-pick matching
 * (a manager whose own loginId matches a roster player occupies their squad
 * slot AS that player, no separate manager-fee slot), the per-league manager
 * base price, and the resulting budget/slots — without writing anything.
 * Shared by openPreAuction (draft path) and startBiddingDirect (skip path),
 * which differ only in which TeamAuctionEntryStatus the plan gets written
 * with and whether Auction lands on PRE_AUCTION_OPEN or BIDDING.
 */
async function planTeamAuctionEntries(auction: AuctionForEntryPlanning): Promise<TeamEntryPlan[]> {
  const selfPlayerIdByManagerId = new Map<string, string | null>();
  for (const team of auction.tournament.teams) {
    if (team.managerId && !selfPlayerIdByManagerId.has(team.managerId)) {
      selfPlayerIdByManagerId.set(
        team.managerId,
        await findManagerSelfAuctionPlayerId(auction.id, team.managerId)
      );
    }
  }

  // A manager's base price is per-league (LeagueMembership.managerBasePrice),
  // not a single global value — fetched in one batch for every team's manager
  // in this tournament's own league.
  const managerIds = auction.tournament.teams
    .map((t) => t.managerId)
    .filter((id): id is string => !!id);
  const managerMemberships = await prisma.leagueMembership.findMany({
    where: { userId: { in: managerIds }, leagueId: auction.tournament.leagueId },
    select: { userId: true, managerBasePrice: true },
  });
  const managerBasePriceByManagerId = new Map(
    managerMemberships.map((m) => [m.userId, m.managerBasePrice])
  );

  return auction.tournament.teams.map((team) => {
    const selfPlayerId = team.managerId ? selfPlayerIdByManagerId.get(team.managerId) : null;
    const managerHasOwnPlayerPick = team.managerOccupiesSlot && !!selfPlayerId;

    const managerSlotPrice = managerHasOwnPlayerPick
      ? new Prisma.Decimal(0)
      : computeManagerSlotPrice(
          team.managerOccupiesSlot,
          team.managerId ? (managerBasePriceByManagerId.get(team.managerId) ?? null) : null,
          null
        );
    const budgetRemaining = new Prisma.Decimal(auction.teamBudget).minus(managerSlotPrice);
    if (budgetRemaining.lessThan(0)) {
      throw new InsufficientBudgetError(
        `Team "${team.name}"'s manager price exceeds the auction's team budget`
      );
    }

    return {
      teamId: team.id,
      budgetRemaining,
      slotsFilled: managerHasOwnPlayerPick ? 0 : team.managerOccupiesSlot ? 1 : 0,
      slotsTotal: auction.tournament.squadSize,
    };
  });
}

export async function openPreAuction(auctionId: string, actorUserId: string) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: { include: { teams: true } } },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "CREATED") {
    throw new InvalidStateTransitionError(
      `Cannot open pre-auction from status ${auction.status}`
    );
  }

  const plans = await planTeamAuctionEntries(auction);

  return prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      await tx.teamAuctionEntry.create({
        data: { ...plan, auctionId: auction.id, status: "PRE_AUCTION_DRAFTING" },
      });
    }

    const updated = await tx.auction.update({
      where: { id: auctionId },
      data: { status: "PRE_AUCTION_OPEN" },
    });
    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "PRE_AUCTION_OPENED",
      actorUserId,
      before: { status: auction.status },
      after: { status: "PRE_AUCTION_OPEN" },
    });
    return updated;
  });
}

/**
 * The CREATED -> BIDDING direct path for an auction configured to skip the
 * pre-auction draft (Auction.skipPreAuctionDraft). Reuses the exact same
 * per-team entry math openPreAuction uses (via planTeamAuctionEntries), just
 * skips PRE_AUCTION_OPEN/PRE_AUCTION_LOCKED, the draft-submission wait, and
 * resolveOverlaps (nothing to resolve — no draft submissions exist).
 *
 * No changes are needed to resetAuctionToPreBidding for this to work: a
 * reset already reuses the auction's existing TeamAuctionEntry rows and
 * lands the auction at PRE_AUCTION_LOCKED regardless of how BIDDING was
 * first reached, so the plain startBidding (which only requires
 * PRE_AUCTION_LOCKED) resumes a skip-configured auction correctly with zero
 * changes there. startBiddingDirect is only ever used for the *first*
 * CREATED -> BIDDING transition.
 */
export async function startBiddingDirect(auctionId: string, actorUserId: string) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: { include: { teams: true } } },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (!auction.skipPreAuctionDraft) {
    throw new InvalidStateTransitionError(
      "This auction requires the pre-auction draft — open pre-auction instead"
    );
  }
  if (auction.status !== "CREATED") {
    throw new InvalidStateTransitionError(
      `Cannot start bidding directly from status ${auction.status}`
    );
  }

  const plans = await planTeamAuctionEntries(auction);

  return prisma.$transaction(async (tx) => {
    for (const plan of plans) {
      await tx.teamAuctionEntry.create({
        data: { ...plan, auctionId: auction.id, status: "AUCTION_LIVE" },
      });
    }

    const updated = await tx.auction.update({
      where: { id: auctionId },
      data: { status: "BIDDING", startedAt: new Date() },
    });
    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "BIDDING_STARTED_DIRECT",
      actorUserId,
      before: { status: auction.status },
      after: { status: "BIDDING" },
    });
    return updated;
  });
}

export async function lockPreAuction(auctionId: string, force: boolean, actorUserId: string) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { entries: { include: { team: true } } },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "PRE_AUCTION_OPEN") {
    throw new InvalidStateTransitionError(
      `Cannot lock pre-auction from status ${auction.status}`
    );
  }

  if (!force) {
    const notSubmitted = auction.entries.filter((e) => e.status !== "PRE_AUCTION_SUBMITTED");
    if (notSubmitted.length > 0) {
      throw new ValidationError(
        `Teams have not submitted their draft: ${notSubmitted.map((e) => e.team.name).join(", ")}`
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.auction.update({
      where: { id: auctionId },
      data: { status: "PRE_AUCTION_LOCKED" },
    });

    const result = await resolveOverlaps(tx, auctionId);

    if (actorUserId) {
      await writeAuditLog(tx, {
        entityType: "Auction",
        entityId: auctionId,
        auctionId,
        action: "PRE_AUCTION_LOCKED",
        actorUserId,
        before: { status: "PRE_AUCTION_OPEN" },
        after: { status: "PRE_AUCTION_LOCKED" },
        note: `Auto-resolved ${result.autoAllocated} overlapping pick(s), ${result.sentToPool} sent to the live pool`,
      });
    }
  });
}

export async function startBidding(auctionId: string, actorUserId: string) {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "PRE_AUCTION_LOCKED") {
    throw new InvalidStateTransitionError(`Cannot start bidding from status ${auction.status}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.teamAuctionEntry.updateMany({
      where: { auctionId },
      data: { status: "AUCTION_LIVE" },
    });
    const updated = await tx.auction.update({
      where: { id: auctionId },
      data: { status: "BIDDING", startedAt: new Date() },
    });
    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "BIDDING_STARTED",
      actorUserId,
      before: { status: "PRE_AUCTION_LOCKED" },
      after: { status: "BIDDING" },
    });
    return updated;
  });
}

/**
 * Reverts an auction from BIDDING back to PRE_AUCTION_LOCKED, undoing everything
 * that happened during this bidding session: live-bid sales are unwound (players
 * un-sold, teams refunded budget/slots), and any player put on the clock or marked
 * unsold is restored to its pre-bidding status. Pre-auction draft allocations and
 * admin-assigned players are untouched — those happened before bidding started.
 */
export async function resetAuctionToPreBidding(auctionId: string, actorUserId: string) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "BIDDING") {
    throw new InvalidStateTransitionError(`Cannot reset from status ${auction.status}`);
  }

  const [auctionPlayers, submissions] = await Promise.all([
    prisma.auctionPlayer.findMany({ where: { auctionId } }),
    prisma.preAuctionSubmission.findMany({ where: { teamAuctionEntry: { auctionId } } }),
  ]);

  const submissionCountByPlayer = new Map<string, number>();
  for (const s of submissions) {
    submissionCountByPlayer.set(
      s.auctionPlayerId,
      (submissionCountByPlayer.get(s.auctionPlayerId) ?? 0) + 1
    );
  }
  function preBiddingStatus(auctionPlayerId: string) {
    return (submissionCountByPlayer.get(auctionPlayerId) ?? 0) > 1
      ? ("IN_PRE_AUCTION_POOL" as const)
      : ("AVAILABLE" as const);
  }

  const refundByEntry = new Map<string, { budget: Prisma.Decimal; slots: number }>();
  for (const ap of auctionPlayers) {
    if (ap.soldVia === "LIVE_BID" && ap.soldToEntryId) {
      const current = refundByEntry.get(ap.soldToEntryId) ?? {
        budget: new Prisma.Decimal(0),
        slots: 0,
      };
      current.budget = current.budget.plus(ap.soldPrice ?? 0);
      current.slots += 1;
      refundByEntry.set(ap.soldToEntryId, current);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const ap of auctionPlayers) {
      if (ap.soldVia === "PRE_AUCTION_DRAFT" || ap.soldVia === "ADMIN_ASSIGNED") continue;

      if (ap.soldVia === "LIVE_BID") {
        await tx.auctionPlayer.update({
          where: { id: ap.id },
          data: {
            status: preBiddingStatus(ap.id),
            soldVia: null,
            soldToEntryId: null,
            soldPrice: null,
            soldAt: null,
            currentBidAmount: null,
            currentBidderEntryId: null,
            bidCooldownUntil: null,
            lotTimerDeadline: null,
            discountedBasePrice: null,
            reAuctionDiscountUsed: false,
          },
        });
      } else if (ap.status === "UNSOLD" || ap.status === "IN_BIDDING") {
        // Live-bid state (not the permanent Bid history, which is never
        // deleted) is transient and doesn't make sense once back in a
        // pre-bidding auction state.
        await tx.auctionPlayer.update({
          where: { id: ap.id },
          data: {
            status: preBiddingStatus(ap.id),
            currentBidAmount: null,
            currentBidderEntryId: null,
            bidCooldownUntil: null,
            lotTimerDeadline: null,
            discountedBasePrice: null,
            reAuctionDiscountUsed: false,
          },
        });
      }
    }

    for (const [entryId, refund] of refundByEntry.entries()) {
      const entry = await tx.teamAuctionEntry.findUniqueOrThrow({ where: { id: entryId } });
      await tx.teamAuctionEntry.update({
        where: { id: entryId },
        data: {
          budgetRemaining: new Prisma.Decimal(entry.budgetRemaining).plus(refund.budget),
          slotsFilled: entry.slotsFilled - refund.slots,
        },
      });
    }

    await tx.teamAuctionEntry.updateMany({
      where: { auctionId },
      data: { status: "ALLOCATED_PRE_AUCTION" },
    });

    await tx.auction.update({
      where: { id: auctionId },
      data: { status: "PRE_AUCTION_LOCKED", startedAt: null },
    });

    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "AUCTION_RESET_TO_PRE_BIDDING",
      actorUserId,
      before: { status: "BIDDING" },
      after: { status: "PRE_AUCTION_LOCKED" },
      note: `Unwound ${refundByEntry.size} team(s)' live-bid sales`,
    });
  });

  const freshState = await getAuctionState(auctionId);
  if (freshState) {
    emitAuctionEvent(auctionId, "auction:reset", freshState);
  }
}

/**
 * Lets an admin adjust team budget and/or squad size for an auction already
 * underway. Auction.teamBudget and Tournament.squadSize are write-once
 * template values only ever read at openPreAuction time — the numbers that
 * actually govern bidding are each TeamAuctionEntry's own budgetRemaining/
 * slotsTotal, so this reaches into every entry directly rather than editing
 * the (otherwise inert) parent records. A budget change shifts every team's
 * remaining budget by the same delta (preserving what's already spent); a
 * squad-size change sets every team's slot cap to the same new number
 * (there's no per-team spend history to preserve for a slot count). Squad
 * size here is scoped to this auction only — Tournament.squadSize is never
 * touched, matching how updateAuctionPlayerCategory overrides a category
 * per-auction without writing back to the Player template.
 */
export async function updateAuctionTeamSettings(
  auctionId: string,
  input: { newTeamBudget?: number; newSquadSize?: number },
  actorUserId: string
) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  if (input.newTeamBudget == null && input.newSquadSize == null) {
    throw new ValidationError("Provide a new team budget and/or a new squad size");
  }
  if (input.newTeamBudget != null && input.newTeamBudget <= 0) {
    throw new ValidationError("Team budget must be greater than 0");
  }
  if (
    input.newSquadSize != null &&
    (!Number.isInteger(input.newSquadSize) || input.newSquadSize <= 0)
  ) {
    throw new ValidationError("Squad size must be a whole number greater than 0");
  }

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { entries: { include: { team: true } } },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status === "CREATED") {
    throw new InvalidStateTransitionError("Open pre-auction before editing team budget or squad size");
  }
  if (auction.status === "COMPLETED") {
    throw new InvalidStateTransitionError(
      "Cannot edit team budget or squad size once the auction has concluded"
    );
  }

  const budgetDelta =
    input.newTeamBudget != null
      ? new Prisma.Decimal(input.newTeamBudget).minus(auction.teamBudget)
      : null;

  const budgetViolations: string[] = [];
  const squadViolations: string[] = [];
  const plan = auction.entries.map((entry) => {
    const newBudgetRemaining =
      budgetDelta != null
        ? new Prisma.Decimal(entry.budgetRemaining).plus(budgetDelta)
        : new Prisma.Decimal(entry.budgetRemaining);
    const newSlotsTotal = input.newSquadSize ?? entry.slotsTotal;

    if (newBudgetRemaining.lessThan(0)) {
      budgetViolations.push(`"${entry.team.name}" would go ${newBudgetRemaining.toString()} into deficit`);
    }
    if (newSlotsTotal < entry.slotsFilled) {
      squadViolations.push(`"${entry.team.name}" already has ${entry.slotsFilled} filled slot(s)`);
    }
    return {
      entryId: entry.id,
      teamName: entry.team.name,
      newBudgetRemaining,
      newSlotsTotal,
      slotsFilled: entry.slotsFilled,
    };
  });

  if (budgetViolations.length > 0 || squadViolations.length > 0) {
    const messages = [
      budgetViolations.length > 0 ? `Insufficient budget: ${budgetViolations.join("; ")}` : null,
      squadViolations.length > 0 ? `Squad cap too low: ${squadViolations.join("; ")}` : null,
    ].filter((m): m is string => m != null);
    if (budgetViolations.length > 0 && squadViolations.length === 0) {
      throw new InsufficientBudgetError(messages.join(" "));
    }
    if (squadViolations.length > 0 && budgetViolations.length === 0) {
      throw new SquadCapExceededError(messages.join(" "));
    }
    throw new ValidationError(messages.join(" "));
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      await tx.teamAuctionEntry.update({
        where: { id: p.entryId },
        data: { budgetRemaining: p.newBudgetRemaining, slotsTotal: p.newSlotsTotal },
      });
    }
    if (input.newTeamBudget != null) {
      await tx.auction.update({ where: { id: auctionId }, data: { teamBudget: input.newTeamBudget } });
    }
    const before: Record<string, string | number> = {};
    const after: Record<string, string | number> = {};
    if (input.newTeamBudget != null) {
      before.teamBudget = auction.teamBudget.toString();
      after.teamBudget = input.newTeamBudget.toString();
    }
    if (input.newSquadSize != null) {
      before.slotsTotal = auction.entries[0]?.slotsTotal ?? 0;
      after.slotsTotal = input.newSquadSize;
    }
    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "TEAM_SETTINGS_UPDATED",
      actorUserId,
      before,
      after,
    });
  });

  for (const p of plan) {
    emitAuctionEvent(auctionId, "team:budget-updated", {
      teamAuctionEntryId: p.entryId,
      teamName: p.teamName,
      budgetRemaining: p.newBudgetRemaining.toString(),
      slotsFilled: p.slotsFilled,
      slotsTotal: p.newSlotsTotal,
    });
  }
}

/**
 * Changes an auction's "on the clock" template and/or visible-fields
 * selection. Works at any auction status, including live BIDDING — the
 * admin Settings accordion is reachable regardless of status, and every
 * viewer surface (auctioneer console, manager live view, viewer watch page)
 * picks the new value up on its next getAuctionState refresh (the existing
 * "Refresh" button, same as how a roster edit is already picked up today) —
 * no new real-time push needed.
 */
export async function updateOnClockDisplaySettings(
  auctionId: string,
  input: { onClockTemplate?: OnClockTemplate; onClockVisibleFields?: OnClockFieldKey[] },
  actorUserId: string
) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  if (input.onClockTemplate == null && input.onClockVisibleFields == null) {
    throw new ValidationError("Provide a template and/or visible fields to update");
  }
  validateOnClockDisplayInput(input);

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.auction.update({
      where: { id: auctionId },
      data: {
        onClockTemplate: input.onClockTemplate ?? undefined,
        onClockVisibleFields: input.onClockVisibleFields ?? undefined,
      },
    });
    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "ON_CLOCK_SETTINGS_UPDATED",
      actorUserId,
      before: {
        onClockTemplate: auction.onClockTemplate,
        onClockVisibleFields: auction.onClockVisibleFields,
      },
      after: {
        onClockTemplate: updated.onClockTemplate,
        onClockVisibleFields: updated.onClockVisibleFields,
      },
    });
    return updated;
  });
}

export async function deleteAuction(auctionId: string, actorUserId: string) {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status === "BIDDING") {
    throw new ValidationError(
      "Cannot delete an auction that is currently in progress. Conclude it first."
    );
  }

  await prisma.$transaction(async (tx) => {
    // Written before the delete even though there's no FK dependency either
    // way — entityId/auctionId are deliberately bare strings precisely so
    // this row survives the auction it describes being deleted.
    await writeAuditLog(tx, {
      entityType: "Auction",
      entityId: auctionId,
      auctionId,
      action: "AUCTION_DELETED",
      actorUserId,
      before: {
        name: auction.name,
        status: auction.status,
        teamBudget: auction.teamBudget.toString(),
      },
    });
    await tx.auction.delete({ where: { id: auctionId } });
  });
}

/** Auctions a viewer/manager can watch — live or already finished.
 * `leagueIds === null` means unrestricted (site Admin). Shared by
 * app/viewer/page.tsx and the mobile auctions-list route, so both stay in
 * sync automatically. */
export async function listViewableAuctions(leagueIds: string[] | null) {
  return prisma.auction.findMany({
    where: {
      status: { in: ["BIDDING", "COMPLETED"] },
      tournament: leagueIds ? { leagueId: { in: leagueIds } } : undefined,
    },
    include: { tournament: true },
    orderBy: { createdAt: "desc" },
  });
}
