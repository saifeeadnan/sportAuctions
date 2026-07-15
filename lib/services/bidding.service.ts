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
    data: { status: "IN_BIDDING" },
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
  soldVia: $Enums.SoldVia
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
  if (priceDecimal.lessThan(auctionPlayer.category.basePrice)) {
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
  if (budgetAfterPick.lessThan(requiredReserve)) {
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
  price: number
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

  return allocatePlayerToTeam(auctionId, auctionPlayerId, winningTeamAuctionEntryId, price, "LIVE_BID");
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
