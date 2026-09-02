import { prisma } from "@/lib/prisma";
import { Prisma, type $Enums } from "@/app/generated/prisma/client";
import {
  ValidationError,
  InsufficientBudgetError,
  SquadCapExceededError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import { computeReserveUnit } from "@/lib/services/budget.service";
import { assertAuctionLeagueNotReadOnly } from "@/lib/services/league.service";
import { emitAuctionEvent } from "@/server/ws/broadcaster";

export async function selectNextPlayer(auctionId: string, auctionPlayerId: string) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "BIDDING") {
    throw new InvalidStateTransitionError(`Cannot select a player while auction is ${auction.status}`);
  }

  const alreadyOnClock = await prisma.auctionPlayer.findFirst({
    where: { auctionId, status: "IN_BIDDING" },
  });
  if (alreadyOnClock && alreadyOnClock.id !== auctionPlayerId) {
    throw new InvalidStateTransitionError(
      "Another player is already on the clock — resolve it first"
    );
  }

  const auctionPlayer = await prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (!["AVAILABLE", "IN_PRE_AUCTION_POOL", "UNSOLD"].includes(auctionPlayer.status)) {
    throw new InvalidStateTransitionError(
      `Player cannot be put on the clock from status ${auctionPlayer.status}`
    );
  }

  const lotTimerDeadline =
    auction.lotTimerSeconds != null ? new Date(Date.now() + auction.lotTimerSeconds * 1000) : null;

  const updated = await prisma.auctionPlayer.update({
    where: { id: auctionPlayerId },
    data: {
      status: "IN_BIDDING",
      currentBidAmount: null,
      currentBidderEntryId: null,
      bidCooldownUntil: null,
      lotTimerDeadline,
    },
    include: { player: true, category: true },
  });

  emitAuctionEvent(auctionId, "player:on-clock", {
    auctionPlayerId: updated.id,
    playerName: updated.player.name,
    categoryName: updated.category.name,
    basePrice: String(updated.discountedBasePrice ?? updated.category.basePrice),
    lotTimerDeadline: lotTimerDeadline ? lotTimerDeadline.toISOString() : null,
  });

  return updated;
}

/**
 * Shared allocation logic for both live-bid sales and direct admin assignments:
 * validates price/budget/slot-reserve rules, marks the player SOLD, and debits
 * the winning team's entry. Callers are responsible for checking the player's
 * starting status is appropriate for their flow.
 */
async function allocatePlayerToTeam(
  auctionId: string,
  auctionPlayerId: string,
  teamAuctionEntryId: string,
  price: number,
  soldVia: $Enums.SoldVia,
  options: {
    /** Admin override for a live sale: skips the below-base-price and
     * budget-reserve-for-remaining-slots checks (the two a human might
     * knowingly accept), but never the squad-cap or literal
     * insufficient-funds checks below — those would corrupt the data. */
    force?: boolean;
  } = {}
) {
  await assertAuctionLeagueNotReadOnly(auctionId);
  if (price <= 0) throw new ValidationError("Price must be greater than 0");

  const [auctionPlayer, entry, categories] = await Promise.all([
    prisma.auctionPlayer.findUnique({
      where: { id: auctionPlayerId },
      include: { player: true, category: true },
    }),
    prisma.teamAuctionEntry.findUnique({
      where: { id: teamAuctionEntryId },
      include: { team: true },
    }),
    prisma.auctionCategory.findMany({ where: { auctionId } }),
  ]);

  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (!entry || entry.auctionId !== auctionId) {
    throw new ValidationError("Team is not part of this auction");
  }
  if (entry.slotsFilled >= entry.slotsTotal) {
    throw new SquadCapExceededError(`Team "${entry.team.name}" has already filled its squad`);
  }

  const priceDecimal = new Prisma.Decimal(price);
  const effectiveBasePrice = auctionPlayer.discountedBasePrice ?? auctionPlayer.category.basePrice;
  if (!options.force && priceDecimal.lessThan(effectiveBasePrice)) {
    throw new ValidationError(
      `Price must be at least the base price (${String(effectiveBasePrice)}) for category "${auctionPlayer.category.name}"`
    );
  }
  if (priceDecimal.greaterThan(entry.budgetRemaining)) {
    throw new InsufficientBudgetError(
      `Team "${entry.team.name}" does not have enough budget remaining for this price`
    );
  }

  const remainingSlotsAfterPick = entry.slotsTotal - entry.slotsFilled - 1;
  const reserveUnit = computeReserveUnit(categories);
  const budgetAfterPick = new Prisma.Decimal(entry.budgetRemaining).minus(priceDecimal);
  const requiredReserve = reserveUnit.times(remainingSlotsAfterPick);
  if (!options.force && budgetAfterPick.lessThan(requiredReserve)) {
    throw new InsufficientBudgetError(
      `Team "${entry.team.name}" must keep at least ${requiredReserve.toString()} in budget to fill its remaining ${remainingSlotsAfterPick} slot(s)`
    );
  }

  const soldAt = new Date();
  const [updatedPlayer, updatedEntry] = await prisma.$transaction([
    prisma.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: {
        status: "SOLD",
        soldVia,
        soldToEntryId: teamAuctionEntryId,
        soldPrice: priceDecimal,
        soldAt,
        currentBidAmount: null,
        currentBidderEntryId: null,
        bidCooldownUntil: null,
        lotTimerDeadline: null,
      },
      include: { player: true },
    }),
    prisma.teamAuctionEntry.update({
      where: { id: teamAuctionEntryId },
      data: {
        budgetRemaining: budgetAfterPick,
        slotsFilled: { increment: 1 },
      },
      include: { team: true },
    }),
  ]);

  emitAuctionEvent(auctionId, "player:sold", {
    auctionPlayerId: updatedPlayer.id,
    playerName: updatedPlayer.player.name,
    teamAuctionEntryId: updatedEntry.id,
    teamName: updatedEntry.team.name,
    price: priceDecimal.toString(),
    soldAt: soldAt.toISOString(),
  });
  emitAuctionEvent(auctionId, "team:budget-updated", {
    teamAuctionEntryId: updatedEntry.id,
    teamName: updatedEntry.team.name,
    budgetRemaining: updatedEntry.budgetRemaining.toString(),
    slotsFilled: updatedEntry.slotsFilled,
    slotsTotal: updatedEntry.slotsTotal,
  });

  return { player: updatedPlayer, entry: updatedEntry };
}

export async function recordSale(
  auctionId: string,
  auctionPlayerId: string,
  winningTeamAuctionEntryId: string,
  price: number,
  options: { force?: boolean } = {}
) {
  const auctionPlayer = await prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "IN_BIDDING") {
    throw new InvalidStateTransitionError(
      `Player must be on the clock to record a sale (current status: ${auctionPlayer.status})`
    );
  }
  if (auctionPlayer.currentBidAmount != null && new Prisma.Decimal(price).lessThan(auctionPlayer.currentBidAmount)) {
    throw new ValidationError(
      `Price cannot be below the current live bid (${String(auctionPlayer.currentBidAmount)})`
    );
  }

  return allocatePlayerToTeam(auctionId, auctionPlayerId, winningTeamAuctionEntryId, price, "LIVE_BID", options);
}

/**
 * Admin directly assigns a roster player to a team at a specified price,
 * bypassing the pre-auction draft and live auction entirely. The player is
 * immediately marked SOLD, so they never appear in a manager's draft pool
 * or the auctioneer's live queue.
 */
export async function adminAssignPlayer(
  auctionId: string,
  auctionPlayerId: string,
  teamAuctionEntryId: string,
  price: number
) {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status === "CREATED") {
    throw new InvalidStateTransitionError("Open pre-auction before assigning players to teams");
  }
  if (auction.status === "COMPLETED") {
    throw new InvalidStateTransitionError("Cannot assign players once the auction has concluded");
  }

  const auctionPlayer = await prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "AVAILABLE") {
    throw new InvalidStateTransitionError(
      `Player cannot be directly assigned from status ${auctionPlayer.status}`
    );
  }

  return allocatePlayerToTeam(auctionId, auctionPlayerId, teamAuctionEntryId, price, "ADMIN_ASSIGNED");
}

/**
 * A team manager's live competing bid on the player currently on the clock.
 * A team can never re-raise its own standing bid — it can only bid again
 * once another team has taken the lead. Uses an optimistic compare-and-swap
 * (`updateMany` guarded by the exact `currentBidAmount` we read) so two
 * concurrent bids on the same player can't both "win" — the loser gets
 * `count: 0` and its whole transaction (including the Bid history row) rolls
 * back, closing a race `allocatePlayerToTeam` doesn't otherwise guard against.
 */
export async function placeBid(
  auctionId: string,
  auctionPlayerId: string,
  teamAuctionEntryId: string,
  amount: number
) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const [auctionPlayer, entry] = await Promise.all([
    prisma.auctionPlayer.findUnique({
      where: { id: auctionPlayerId },
      include: { category: true, auction: true },
    }),
    prisma.teamAuctionEntry.findUnique({
      where: { id: teamAuctionEntryId },
      include: { team: true },
    }),
  ]);

  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (!entry || entry.auctionId !== auctionId) {
    throw new ValidationError("Team is not part of this auction");
  }
  if (auctionPlayer.status !== "IN_BIDDING") {
    throw new InvalidStateTransitionError("This player is not currently on the clock");
  }
  if (entry.slotsFilled >= entry.slotsTotal) {
    throw new SquadCapExceededError(`Team "${entry.team.name}" has already filled its squad`);
  }
  if (entry.id === auctionPlayer.currentBidderEntryId) {
    throw new ValidationError("You already hold the highest bid — wait for another team to outbid you");
  }
  if (auctionPlayer.bidCooldownUntil && auctionPlayer.bidCooldownUntil > new Date()) {
    throw new ValidationError("A bid was just placed — please wait a moment before bidding again");
  }

  const amountDecimal = new Prisma.Decimal(amount);
  const effectiveBasePrice = auctionPlayer.discountedBasePrice ?? auctionPlayer.category.basePrice;
  const currentBid = auctionPlayer.currentBidAmount;
  if (currentBid == null) {
    if (amountDecimal.lessThan(effectiveBasePrice)) {
      throw new ValidationError(`Bid must be at least the base price (${String(effectiveBasePrice)})`);
    }
  } else {
    const minRequired = auctionPlayer.category.bidIncrement
      ? new Prisma.Decimal(currentBid).plus(auctionPlayer.category.bidIncrement)
      : null;
    const isValid = minRequired
      ? !amountDecimal.lessThan(minRequired)
      : amountDecimal.greaterThan(currentBid);
    if (!isValid) {
      throw new ValidationError(
        minRequired
          ? `Bid must be at least ${minRequired.toString()} (current bid + this category's increment)`
          : `Bid must be higher than the current bid (${String(currentBid)})`
      );
    }
  }

  // Same reserve-for-remaining-slots check allocatePlayerToTeam uses for a
  // final sale — a team can bid up to what it could actually afford to WIN
  // with. The bid itself never debits budget; only a completed sale does.
  const categories = await prisma.auctionCategory.findMany({ where: { auctionId } });
  const reserveUnit = computeReserveUnit(categories);
  const slotsAfterThisWin = Math.max(entry.slotsTotal - entry.slotsFilled - 1, 0);
  const maxAffordable = new Prisma.Decimal(entry.budgetRemaining).minus(
    reserveUnit.times(slotsAfterThisWin)
  );
  if (amountDecimal.greaterThan(maxAffordable)) {
    throw new InsufficientBudgetError(
      `This bid would leave "${entry.team.name}" unable to fill its remaining slots`
    );
  }

  const cooldownUntil = new Date(Date.now() + 2_000);
  const lotTimerDeadline =
    auctionPlayer.auction.lotTimerSeconds != null
      ? new Date(Date.now() + auctionPlayer.auction.lotTimerSeconds * 1000)
      : null;
  const bid = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.auctionPlayer.updateMany({
      where: { id: auctionPlayerId, status: "IN_BIDDING", currentBidAmount: currentBid },
      data: {
        currentBidAmount: amountDecimal,
        currentBidderEntryId: teamAuctionEntryId,
        bidCooldownUntil: cooldownUntil,
        lotTimerDeadline,
      },
    });
    if (updateResult.count === 0) {
      throw new ValidationError("Someone else just bid on this player — refresh and try again");
    }
    return tx.bid.create({ data: { auctionPlayerId, teamAuctionEntryId, amount: amountDecimal } });
  });

  emitAuctionEvent(auctionId, "bid:placed", {
    auctionPlayerId,
    teamAuctionEntryId,
    teamName: entry.team.name,
    amount: amountDecimal.toString(),
    cooldownUntil: cooldownUntil.toISOString(),
    lotTimerDeadline: lotTimerDeadline ? lotTimerDeadline.toISOString() : null,
  });

  return bid;
}

export async function markUnsold(auctionId: string, auctionPlayerId: string) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const [auction, auctionPlayer] = await Promise.all([
    prisma.auction.findUnique({ where: { id: auctionId } }),
    prisma.auctionPlayer.findUnique({
      where: { id: auctionPlayerId },
      include: { player: true, category: true },
    }),
  ]);
  if (!auction) throw new ValidationError("Auction not found");
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "IN_BIDDING") {
    throw new InvalidStateTransitionError(
      `Player must be on the clock to mark unsold (current status: ${auctionPlayer.status})`
    );
  }

  // The first time a player goes unsold under a re-auction-enabled auction,
  // its price drops once and permanently — reAuctionDiscountUsed guards
  // against ever discounting it again on a later unsold round.
  let discountFields: { discountedBasePrice?: Prisma.Decimal; reAuctionDiscountUsed?: boolean } = {};
  if (
    auction.reAuctionEnabled &&
    !auctionPlayer.reAuctionDiscountUsed &&
    auction.reAuctionDiscountPercent != null
  ) {
    const discounted = new Prisma.Decimal(auctionPlayer.category.basePrice)
      .times(new Prisma.Decimal(100).minus(auction.reAuctionDiscountPercent))
      .dividedBy(100)
      .toDecimalPlaces(2);
    discountFields = { discountedBasePrice: discounted, reAuctionDiscountUsed: true };
  }

  const updated = await prisma.auctionPlayer.update({
    where: { id: auctionPlayerId },
    data: { status: "UNSOLD", lotTimerDeadline: null, ...discountFields },
    include: { player: true, category: true },
  });

  emitAuctionEvent(auctionId, "player:unsold", {
    auctionPlayerId: updated.id,
    playerName: updated.player.name,
    basePrice: String(updated.discountedBasePrice ?? updated.category.basePrice),
  });

  return updated;
}

/**
 * Reverses a completed allocation — however it was sold (live bid, admin
 * assignment, or pre-auction draft) — returning the player to the pool as
 * AVAILABLE and refunding the team's budget and slot.
 */
export async function removePlayerFromTeam(auctionId: string, auctionPlayerId: string) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status === "CREATED") {
    throw new InvalidStateTransitionError("Open pre-auction before removing player allocations");
  }
  if (auction.status === "COMPLETED") {
    throw new InvalidStateTransitionError("Cannot modify allocations once the auction has concluded");
  }

  const auctionPlayer = await prisma.auctionPlayer.findUnique({
    where: { id: auctionPlayerId },
    include: { player: true },
  });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "SOLD" || !auctionPlayer.soldToEntryId) {
    throw new InvalidStateTransitionError(
      `Player is not currently allocated to a team (status: ${auctionPlayer.status})`
    );
  }

  const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({
    where: { id: auctionPlayer.soldToEntryId },
  });
  const refund = auctionPlayer.soldPrice ?? new Prisma.Decimal(0);

  const [updatedPlayer, updatedEntry] = await prisma.$transaction([
    prisma.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: { status: "AVAILABLE", soldVia: null, soldToEntryId: null, soldPrice: null, soldAt: null },
      include: { player: true },
    }),
    prisma.teamAuctionEntry.update({
      where: { id: entry.id },
      data: {
        budgetRemaining: new Prisma.Decimal(entry.budgetRemaining).plus(refund),
        slotsFilled: { decrement: 1 },
      },
      include: { team: true },
    }),
  ]);

  emitAuctionEvent(auctionId, "player:removed", {
    auctionPlayerId: updatedPlayer.id,
    playerName: updatedPlayer.player.name,
  });
  emitAuctionEvent(auctionId, "team:budget-updated", {
    teamAuctionEntryId: updatedEntry.id,
    teamName: updatedEntry.team.name,
    budgetRemaining: updatedEntry.budgetRemaining.toString(),
    slotsFilled: updatedEntry.slotsFilled,
    slotsTotal: updatedEntry.slotsTotal,
  });

  return { player: updatedPlayer, entry: updatedEntry };
}

function assertAuctionCompleted(auction: { status: $Enums.AuctionStatus }) {
  if (auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError(
      "Roster changes are only available after the auction has concluded"
    );
  }
}

/**
 * Finds (or creates) the AuctionPlayer row a post-auction roster edit should
 * point an incoming player at. The replacement pool is the whole tournament
 * roster, not just this auction's existing pool — a player who was never
 * added to this auction at all is a valid replacement, mirroring how
 * addPlayerToAuction (auction.service.ts) creates a fresh row on the fly
 * mid-auction. Runs inside the caller's own transaction since it both reads
 * and writes.
 */
async function resolveIncomingAuctionPlayer(
  tx: Prisma.TransactionClient,
  auctionId: string,
  tournamentRosterId: string | null,
  playerId: string,
  categoryId: string
): Promise<{ auctionPlayerId: string }> {
  const existing = await tx.auctionPlayer.findUnique({
    where: { auctionId_playerId: { auctionId, playerId } },
    include: { player: true, soldToEntry: { include: { team: true } } },
  });

  if (existing) {
    if (existing.status === "SOLD") {
      throw new ValidationError(
        `${existing.player.name} is already on "${existing.soldToEntry?.team.name}"'s roster in this auction`
      );
    }
    // The only other status a leftover player can be in once an auction has
    // concluded is UNSOLD — reuse the row, letting the admin correct its
    // category in the same step.
    await tx.auctionPlayer.update({ where: { id: existing.id }, data: { categoryId } });
    return { auctionPlayerId: existing.id };
  }

  const player = await tx.player.findUnique({ where: { id: playerId } });
  if (!player || player.rosterId !== tournamentRosterId) {
    throw new ValidationError("Player does not belong to this tournament's roster");
  }
  const category = await tx.auctionCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.auctionId !== auctionId) {
    throw new ValidationError("Category does not belong to this auction");
  }

  const created = await tx.auctionPlayer.create({
    data: { auctionId, playerId, categoryId, status: "UNSOLD" },
  });
  return { auctionPlayerId: created.id };
}

/**
 * Drops a player from a team after the auction has concluded — e.g. an
 * injury or suspension with no immediate replacement — refunding the price
 * and freeing the slot. The player rejoins the pool as UNSOLD (not
 * AVAILABLE), the same bucket concludeAuction already put every other
 * leftover player in, so a completed auction's player statuses stay
 * consistent.
 */
export async function removePlayerPostAuction(auctionId: string, auctionPlayerId: string) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  assertAuctionCompleted(auction);

  const auctionPlayer = await prisma.auctionPlayer.findUnique({
    where: { id: auctionPlayerId },
    include: { player: true },
  });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "SOLD" || !auctionPlayer.soldToEntryId) {
    throw new InvalidStateTransitionError(
      `Player is not currently allocated to a team (status: ${auctionPlayer.status})`
    );
  }

  const entry = await prisma.teamAuctionEntry.findUniqueOrThrow({
    where: { id: auctionPlayer.soldToEntryId },
  });
  const refund = auctionPlayer.soldPrice ?? new Prisma.Decimal(0);

  const [updatedPlayer, updatedEntry] = await prisma.$transaction([
    prisma.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: { status: "UNSOLD", soldVia: null, soldToEntryId: null, soldPrice: null, soldAt: null },
      include: { player: true },
    }),
    prisma.teamAuctionEntry.update({
      where: { id: entry.id },
      data: {
        budgetRemaining: new Prisma.Decimal(entry.budgetRemaining).plus(refund),
        slotsFilled: { decrement: 1 },
        // A removed player can't stay captain of a roster they're no longer
        // on — leaving this pointing at them would silently orphan the
        // designation with no visible sign anything changed.
        ...(entry.captainAuctionPlayerId === auctionPlayerId ? { captainAuctionPlayerId: null } : {}),
      },
      include: { team: true },
    }),
  ]);

  return { player: updatedPlayer, entry: updatedEntry };
}

/**
 * Adds a player to a team that finished the auction with an open slot —
 * e.g. it never got fully staffed. Standalone counterpart to
 * removePlayerPostAuction; replacePlayerPostAuction below combines both.
 */
export async function addPlayerPostAuction(
  auctionId: string,
  teamAuctionEntryId: string,
  playerId: string,
  categoryId: string,
  price: number
) {
  await assertAuctionLeagueNotReadOnly(auctionId);
  if (price <= 0) throw new ValidationError("Price must be greater than 0");

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) throw new ValidationError("Auction not found");
  assertAuctionCompleted(auction);

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: { team: true },
  });
  if (!entry || entry.auctionId !== auctionId) {
    throw new ValidationError("Team is not part of this auction");
  }
  if (entry.slotsFilled >= entry.slotsTotal) {
    throw new SquadCapExceededError(`Team "${entry.team.name}" has already filled its squad`);
  }
  const priceDecimal = new Prisma.Decimal(price);
  if (priceDecimal.greaterThan(entry.budgetRemaining)) {
    throw new InsufficientBudgetError(
      `Team "${entry.team.name}" does not have enough budget remaining for this price`
    );
  }

  return prisma.$transaction(async (tx) => {
    const { auctionPlayerId } = await resolveIncomingAuctionPlayer(
      tx,
      auctionId,
      auction.tournament.rosterId,
      playerId,
      categoryId
    );

    const updatedPlayer = await tx.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: {
        status: "SOLD",
        soldVia: "ADMIN_REPLACED",
        soldToEntryId: teamAuctionEntryId,
        soldPrice: priceDecimal,
        soldAt: new Date(),
      },
      include: { player: true },
    });
    const updatedEntry = await tx.teamAuctionEntry.update({
      where: { id: teamAuctionEntryId },
      data: {
        budgetRemaining: new Prisma.Decimal(entry.budgetRemaining).minus(priceDecimal),
        slotsFilled: { increment: 1 },
      },
      include: { team: true },
    });

    return { player: updatedPlayer, entry: updatedEntry };
  });
}

/**
 * The injury-replacement flow: swaps one player out for another on the same
 * team in a single atomic transaction, so a mid-swap failure can never leave
 * a team short a player. Budget shifts by exactly the price difference;
 * slotsFilled is unchanged since one player leaves as another arrives.
 */
export async function replacePlayerPostAuction(
  auctionId: string,
  outgoingAuctionPlayerId: string,
  incomingPlayerId: string,
  incomingCategoryId: string,
  price: number
) {
  await assertAuctionLeagueNotReadOnly(auctionId);
  if (price <= 0) throw new ValidationError("Price must be greater than 0");

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: true },
  });
  if (!auction) throw new ValidationError("Auction not found");
  assertAuctionCompleted(auction);

  const outgoing = await prisma.auctionPlayer.findUnique({
    where: { id: outgoingAuctionPlayerId },
    include: { player: true },
  });
  if (!outgoing || outgoing.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (outgoing.status !== "SOLD" || !outgoing.soldToEntryId) {
    throw new InvalidStateTransitionError(
      `Player is not currently allocated to a team (status: ${outgoing.status})`
    );
  }
  if (outgoing.playerId === incomingPlayerId) {
    throw new ValidationError("Replacement player must be different from the outgoing player");
  }

  const priceDecimal = new Prisma.Decimal(price);
  const entryId = outgoing.soldToEntryId;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.teamAuctionEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: { team: true },
    });

    const newBudgetRemaining = new Prisma.Decimal(entry.budgetRemaining)
      .plus(outgoing.soldPrice ?? 0)
      .minus(priceDecimal);
    if (newBudgetRemaining.lessThan(0)) {
      throw new InsufficientBudgetError(
        `Team "${entry.team.name}" does not have enough budget remaining for this price`
      );
    }

    const { auctionPlayerId: incomingAuctionPlayerId } = await resolveIncomingAuctionPlayer(
      tx,
      auctionId,
      auction.tournament.rosterId,
      incomingPlayerId,
      incomingCategoryId
    );

    const updatedOutgoing = await tx.auctionPlayer.update({
      where: { id: outgoingAuctionPlayerId },
      data: { status: "UNSOLD", soldVia: null, soldToEntryId: null, soldPrice: null, soldAt: null },
      include: { player: true },
    });
    const updatedIncoming = await tx.auctionPlayer.update({
      where: { id: incomingAuctionPlayerId },
      data: {
        status: "SOLD",
        soldVia: "ADMIN_REPLACED",
        soldToEntryId: entryId,
        soldPrice: priceDecimal,
        soldAt: new Date(),
      },
      include: { player: true },
    });
    const updatedEntry = await tx.teamAuctionEntry.update({
      where: { id: entryId },
      data: {
        budgetRemaining: newBudgetRemaining,
        // Same reasoning as removePlayerPostAuction: the outgoing player
        // can't stay captain of a roster they've just left.
        ...(entry.captainAuctionPlayerId === outgoingAuctionPlayerId
          ? { captainAuctionPlayerId: null }
          : {}),
      },
      include: { team: true },
    });

    return { outgoing: updatedOutgoing, incoming: updatedIncoming, entry: updatedEntry };
  });
}

export async function concludeAuction(auctionId: string) {
  await assertAuctionLeagueNotReadOnly(auctionId);

  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "BIDDING") {
    throw new InvalidStateTransitionError(`Cannot conclude auction from status ${auction.status}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.auctionPlayer.updateMany({
      where: { auctionId, status: { in: ["AVAILABLE", "IN_PRE_AUCTION_POOL", "IN_BIDDING"] } },
      data: { status: "UNSOLD" },
    });
    await tx.teamAuctionEntry.updateMany({
      where: { auctionId },
      data: { status: "FINAL" },
    });
    return tx.auction.update({
      where: { id: auctionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  });

  emitAuctionEvent(auctionId, "auction:completed", { auctionId });

  return updated;
}
