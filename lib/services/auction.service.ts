import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { ValidationError, InsufficientBudgetError, InvalidStateTransitionError } from "@/lib/errors";
import { computeManagerSlotPrice } from "@/lib/services/budget.service";
import { resolveOverlaps } from "@/lib/services/overlapResolution.service";
import { findManagerSelfAuctionPlayerId } from "@/lib/services/preAuctionDraft.service";

export type CreateAuctionInput = {
  tournamentId: string;
  name: string;
  teamBudget: number;
  createdById: string;
  categories: { name: string; basePrice: number }[];
  playerAssignments: { playerId: string; categoryName: string }[];
};

export async function createAuction(input: CreateAuctionInput) {
  if (!input.name.trim()) throw new ValidationError("Auction name is required");
  if (input.teamBudget <= 0) throw new ValidationError("Team budget must be greater than 0");
  if (input.categories.length === 0) throw new ValidationError("At least one category is required");

  const categoryNames = new Set(input.categories.map((c) => c.name.trim()));
  if (categoryNames.size !== input.categories.length) {
    throw new ValidationError("Category names must be unique");
  }
  for (const cat of input.categories) {
    if (cat.basePrice <= 0) {
      throw new ValidationError(`Category "${cat.name}" must have a base price greater than 0`);
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

  const tournament = await prisma.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!tournament) throw new ValidationError("Tournament not found");

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
        createdById: input.createdById,
      },
    });

    const createdCategories = await Promise.all(
      input.categories.map((c) =>
        tx.auctionCategory.create({
          data: { auctionId: auction.id, name: c.name.trim(), basePrice: c.basePrice },
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

    return auction;
  });
}

export async function openPreAuction(auctionId: string) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { tournament: { include: { teams: { include: { manager: true } } } } },
  });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status !== "CREATED") {
    throw new InvalidStateTransitionError(
      `Cannot open pre-auction from status ${auction.status}`
    );
  }

  // A manager who is matched (by login ID) to a player already in the auction's
  // pool occupies their squad slot AS that player — no separate manager-fee slot.
  const selfPlayerIdByManagerId = new Map<string, string | null>();
  for (const team of auction.tournament.teams) {
    if (team.managerId && !selfPlayerIdByManagerId.has(team.managerId)) {
      selfPlayerIdByManagerId.set(
        team.managerId,
        await findManagerSelfAuctionPlayerId(auctionId, team.managerId)
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    for (const team of auction.tournament.teams) {
      const selfPlayerId = team.managerId ? selfPlayerIdByManagerId.get(team.managerId) : null;
      const managerHasOwnPlayerPick = team.managerOccupiesSlot && !!selfPlayerId;

      const managerSlotPrice = managerHasOwnPlayerPick
        ? new Prisma.Decimal(0)
        : computeManagerSlotPrice(
            team.managerOccupiesSlot,
            team.manager?.managerBasePrice ?? null,
            null
          );
      const budgetRemaining = new Prisma.Decimal(auction.teamBudget).minus(managerSlotPrice);
      if (budgetRemaining.lessThan(0)) {
        throw new InsufficientBudgetError(
          `Team "${team.name}"'s manager price exceeds the auction's team budget`
        );
      }

      await tx.teamAuctionEntry.create({
        data: {
          teamId: team.id,
          auctionId: auction.id,
          status: "PRE_AUCTION_DRAFTING",
          budgetRemaining,
          slotsFilled: managerHasOwnPlayerPick ? 0 : team.managerOccupiesSlot ? 1 : 0,
          slotsTotal: auction.tournament.squadSize,
        },
      });
    }

    return tx.auction.update({
      where: { id: auctionId },
      data: { status: "PRE_AUCTION_OPEN" },
    });
  });
}

export async function lockPreAuction(auctionId: string, force = false) {
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

  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: "PRE_AUCTION_LOCKED" },
  });

  await resolveOverlaps(auctionId);
}

export async function startBidding(auctionId: string) {
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
    return tx.auction.update({
      where: { id: auctionId },
      data: { status: "BIDDING", startedAt: new Date() },
    });
  });
}

export async function deleteAuction(auctionId: string) {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new ValidationError("Auction not found");
  if (auction.status === "BIDDING") {
    throw new ValidationError(
      "Cannot delete an auction that is currently in progress. Conclude it first."
    );
  }

  await prisma.auction.delete({ where: { id: auctionId } });
}
