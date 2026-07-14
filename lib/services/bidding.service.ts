import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
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
  if (!["AVAILABLE", "IN_PRE_AUCTION_POOL"].includes(auctionPlayer.status)) {
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

export async function recordSale(
  auctionId: string,
  auctionPlayerId: string,
  winningTeamAuctionEntryId: string,
  price: number
) {
  if (price <= 0) throw new ValidationError("Sale price must be greater than 0");

  const [auctionPlayer, entry, categories] = await Promise.all([
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId }, include: { player: true } }),
    prisma.teamAuctionEntry.findUnique({
      where: { id: winningTeamAuctionEntryId },
      include: { team: true },
    }),
    prisma.auctionCategory.findMany({ where: { auctionId } }),
  ]);

  if (!auctionPlayer || auctionPlayer.auctionId !== auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (auctionPlayer.status !== "IN_BIDDING") {
    throw new InvalidStateTransitionError(
      `Player must be on the clock to record a sale (current status: ${auctionPlayer.status})`
    );
  }
  if (!entry || entry.auctionId !== auctionId) {
    throw new ValidationError("Team is not part of this auction");
  }
  if (entry.slotsFilled >= entry.slotsTotal) {
    throw new SquadCapExceededError(`Team "${entry.team.name}" has already filled its squad`);
  }

  const priceDecimal = new Prisma.Decimal(price);
  if (priceDecimal.greaterThan(entry.budgetRemaining)) {
    throw new InsufficientBudgetError(
      `Team "${entry.team.name}" does not have enough budget remaining for this bid`
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

  const [updatedPlayer, updatedEntry] = await prisma.$transaction([
    prisma.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: {
        status: "SOLD",
        soldVia: "LIVE_BID",
        soldToEntryId: winningTeamAuctionEntryId,
        soldPrice: priceDecimal,
      },
      include: { player: true },
    }),
    prisma.teamAuctionEntry.update({
      where: { id: winningTeamAuctionEntryId },
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
