import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import {
  ValidationError,
  SquadCapExceededError,
  InsufficientBudgetError,
  InvalidStateTransitionError,
} from "@/lib/errors";
import { remainingSlots } from "@/lib/services/budget.service";

/** The auction pool player matching a manager's own login ID, if the manager is also on the roster. */
export async function findManagerSelfAuctionPlayerId(
  auctionId: string,
  managerUserId: string
): Promise<string | null> {
  const manager = await prisma.user.findUnique({
    where: { id: managerUserId },
    select: { loginId: true },
  });
  if (!manager?.loginId) return null;

  const match = await prisma.auctionPlayer.findFirst({
    where: {
      auctionId,
      status: "AVAILABLE",
      player: { loginId: { equals: manager.loginId, mode: "insensitive" } },
    },
    select: { id: true },
  });
  return match?.id ?? null;
}

export async function submitDraft(teamAuctionEntryId: string, auctionPlayerIds: string[]) {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: { team: true },
  });
  if (!entry) throw new ValidationError("Team auction entry not found");

  if (entry.status !== "PRE_AUCTION_DRAFTING" && entry.status !== "PRE_AUCTION_SUBMITTED") {
    throw new InvalidStateTransitionError(
      `Cannot submit a draft while entry is in status ${entry.status}`
    );
  }

  const uniqueIds = new Set(auctionPlayerIds);

  // The manager's own player entry (matched by login ID) is always part of their draft
  // and can never be removed, even if the client omits it.
  if (entry.team.managerId) {
    const selfId = await findManagerSelfAuctionPlayerId(entry.auctionId, entry.team.managerId);
    if (selfId) uniqueIds.add(selfId);
  }

  const idsArray = Array.from(uniqueIds);
  const cap = remainingSlots(entry);
  if (idsArray.length > cap) {
    throw new SquadCapExceededError(
      `Draft list exceeds the remaining ${cap} squad slot(s) for this team`
    );
  }

  if (idsArray.length > 0) {
    const validPlayers = await prisma.auctionPlayer.findMany({
      where: { id: { in: idsArray }, auctionId: entry.auctionId, status: "AVAILABLE" },
      include: { category: true },
    });
    if (validPlayers.length !== idsArray.length) {
      throw new ValidationError(
        "One or more selected players are not available in this auction's pool"
      );
    }

    const totalBasePrice = validPlayers.reduce(
      (sum, ap) => sum.plus(ap.category.basePrice),
      new Prisma.Decimal(0)
    );
    if (totalBasePrice.greaterThan(entry.budgetRemaining)) {
      throw new InsufficientBudgetError(
        `Total base price of selected players (${totalBasePrice.toString()}) exceeds the available budget (${entry.budgetRemaining.toString()})`
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.preAuctionSubmission.deleteMany({ where: { teamAuctionEntryId } });
    if (idsArray.length > 0) {
      await tx.preAuctionSubmission.createMany({
        data: idsArray.map((auctionPlayerId) => ({ teamAuctionEntryId, auctionPlayerId })),
      });
    }
    await tx.teamAuctionEntry.update({
      where: { id: teamAuctionEntryId },
      data: { status: "PRE_AUCTION_SUBMITTED" },
    });
  });
}

export async function removeDraftPick(teamAuctionEntryId: string, auctionPlayerId: string) {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
  });
  if (!entry) throw new ValidationError("Team auction entry not found");

  if (entry.status !== "PRE_AUCTION_DRAFTING") {
    throw new InvalidStateTransitionError(
      `Cannot remove a draft pick while entry is in status ${entry.status}`
    );
  }

  const { count } = await prisma.preAuctionSubmission.deleteMany({
    where: { teamAuctionEntryId, auctionPlayerId },
  });
  if (count === 0) {
    throw new ValidationError("Draft pick not found for this team");
  }
}
