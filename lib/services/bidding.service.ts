import { prisma } from "@/lib/prisma";
import { Prisma, type $Enums } from "@/app/generated/prisma/client";
import {
  ValidationError,
  InsufficientBudgetError,
  SquadCapExceededError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import { computeReserveUnit } from "@/lib/services/budget.service";
import { emitAuctionEvent } from "@/server/ws/broadcaster";

export async function selectNextPlayer(auctionId: string, auctionPlayerId: string) {
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

  const updated = await prisma.auctionPlayer.update({
    where: { id: auctionPlayerId },
    data: {
      status: "IN_BIDDING",
      currentBidAmount: null,
      currentBidderEntryId: null,
      bidCooldownUntil: null,
    },
    include: { player: true, category: true },
  });

  emitAuctionEvent(auctionId, "player:on-clock", {
    auctionPlayerId: updated.id,
    playerName: updated.player.name,
    categoryName: updated.category.name,
    basePrice: String(updated.category.basePrice),
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
  if (!options.force && priceDecimal.lessThan(auctionPlayer.category.basePrice)) {
    throw new ValidationError(
      `Price must be at least the base price (${String(auctionPlayer.category.basePrice)}) for category "${auctionPlayer.category.name}"`
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
  const [auctionPlayer, entry] = await Promise.all([
    prisma.auctionPlayer.findUnique({
      where: { id: auctionPlayerId },
      include: { category: true },
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
  const currentBid = auctionPlayer.currentBidAmount;
  if (currentBid == null) {
    if (amountDecimal.lessThan(auctionPlayer.category.basePrice)) {
      throw new ValidationError(
        `Bid must be at least the base price (${String(auctionPlayer.category.basePrice)})`
      );
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
  const bid = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.auctionPlayer.updateMany({
      where: { id: auctionPlayerId, status: "IN_BIDDING", currentBidAmount: currentBid },
      data: {
        currentBidAmount: amountDecimal,
        currentBidderEntryId: teamAuctionEntryId,
        bidCooldownUntil: cooldownUntil,
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
  });

  return bid;
}

export async function markUnsold(auctionId: string, auctionPlayerId: string) {
  const auctionPlayer = await prisma.auctionPlayer.findUnique({
    where: { id: auctionPlayerId },
    include: { player: true },
  });
  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "IN_BIDDING") {
    throw new InvalidStateTransitionError(
      `Player must be on the clock to mark unsold (current status: ${auctionPlayer.status})`
    );
  }

  const updated = await prisma.auctionPlayer.update({
    where: { id: auctionPlayerId },
    data: { status: "UNSOLD" },
    include: { player: true },
  });

  emitAuctionEvent(auctionId, "player:unsold", {
    auctionPlayerId: updated.id,
    playerName: updated.player.name,
  });

  return updated;
}

/**
 * Reverses a completed allocation — however it was sold (live bid, admin
 * assignment, or pre-auction draft) — returning the player to the pool as
 * AVAILABLE and refunding the team's budget and slot.
 */
export async function removePlayerFromTeam(auctionId: string, auctionPlayerId: string) {
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

export async function concludeAuction(auctionId: string) {
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
