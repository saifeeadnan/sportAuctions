import { prisma } from "@/lib/prisma";
import { ValidationError, SquadCapExceededError, InvalidStateTransitionError } from "@/lib/errors";
import { remainingSlots } from "@/lib/services/budget.service";

export async function submitDraft(teamAuctionEntryId: string, auctionPlayerIds: string[]) {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
  });
  if (!entry) throw new ValidationError("Team auction entry not found");

  if (entry.status !== "PRE_AUCTION_DRAFTING" && entry.status !== "PRE_AUCTION_SUBMITTED") {
    throw new InvalidStateTransitionError(
      `Cannot submit a draft while entry is in status ${entry.status}`
    );
  }

  const cap = remainingSlots(entry);
  const uniqueIds = Array.from(new Set(auctionPlayerIds));
  if (uniqueIds.length > cap) {
    throw new SquadCapExceededError(
      `Draft list exceeds the remaining ${cap} squad slot(s) for this team`
    );
  }

  if (uniqueIds.length > 0) {
    const validPlayers = await prisma.auctionPlayer.findMany({
      where: { id: { in: uniqueIds }, auctionId: entry.auctionId, status: "AVAILABLE" },
      select: { id: true },
    });
    if (validPlayers.length !== uniqueIds.length) {
      throw new ValidationError(
        "One or more selected players are not available in this auction's pool"
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.preAuctionSubmission.deleteMany({ where: { teamAuctionEntryId } });
    if (uniqueIds.length > 0) {
      await tx.preAuctionSubmission.createMany({
        data: uniqueIds.map((auctionPlayerId) => ({ teamAuctionEntryId, auctionPlayerId })),
      });
    }
    await tx.teamAuctionEntry.update({
      where: { id: teamAuctionEntryId },
      data: { status: "PRE_AUCTION_SUBMITTED" },
    });
  });
}
