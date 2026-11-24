import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";

export type PredictionEntry = {
  /** Null when the manager guessed a price without naming a team. */
  predictedWinnerEntryId: string | null;
  /** This manager's own guess at what the winner would pay — optional.
   * Acts as a max price in the Simulate tab. */
  predictedAmount: string | null;
  /** The low end of the guess — optional. Acts as a min price (floor) in
   * the Simulate tab. */
  predictedMinAmount: string | null;
};

/** auctionPlayerId -> prediction, for the calling team only — predictions
 * are private and never visible to any other team. */
export async function getPredictionsForEntry(
  teamAuctionEntryId: string
): Promise<Record<string, PredictionEntry>> {
  const predictions = await prisma.auctionPlayerPrediction.findMany({
    where: { teamAuctionEntryId },
    select: { auctionPlayerId: true, predictedWinnerEntryId: true, predictedAmount: true, predictedMinAmount: true },
  });
  return Object.fromEntries(
    predictions.map((p) => [
      p.auctionPlayerId,
      {
        predictedWinnerEntryId: p.predictedWinnerEntryId,
        predictedAmount: p.predictedAmount != null ? String(p.predictedAmount) : null,
        predictedMinAmount: p.predictedMinAmount != null ? String(p.predictedMinAmount) : null,
      },
    ])
  );
}

export async function savePrediction(
  teamAuctionEntryId: string,
  auctionPlayerId: string,
  predictedWinnerEntryId: string | null,
  predictedAmount: number | null,
  predictedMinAmount: number | null,
  actorUserId: string
) {
  if (predictedWinnerEntryId == null && predictedAmount == null && predictedMinAmount == null) {
    throw new ValidationError("A prediction needs at least a team or an amount");
  }
  if (predictedWinnerEntryId === teamAuctionEntryId) {
    throw new ValidationError("You cannot predict your own team as the winner");
  }
  if (predictedAmount != null && predictedAmount <= 0) {
    throw new ValidationError("Predicted amount must be greater than 0");
  }
  if (predictedMinAmount != null && predictedMinAmount <= 0) {
    throw new ValidationError("Minimum amount must be greater than 0");
  }
  if (predictedMinAmount != null && predictedAmount != null && predictedMinAmount > predictedAmount) {
    throw new ValidationError("Minimum amount cannot be greater than the predicted amount");
  }

  const [entry, auctionPlayer, winnerEntry] = await Promise.all([
    prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } }),
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId }, include: { player: true } }),
    predictedWinnerEntryId != null
      ? prisma.teamAuctionEntry.findUnique({ where: { id: predictedWinnerEntryId } })
      : null,
  ]);
  if (!entry) throw new ValidationError("Team auction entry not found");
  if (!auctionPlayer || auctionPlayer.auctionId !== entry.auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (predictedWinnerEntryId != null && (!winnerEntry || winnerEntry.auctionId !== entry.auctionId)) {
    throw new ValidationError("Predicted team is not part of this auction");
  }
  // Predictions are only meaningful for players reality hasn't already
  // answered for — once sold, the real outcome is what the projection uses.
  if (auctionPlayer.status === "SOLD") {
    throw new ValidationError("This player has already been sold");
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.auctionPlayerPrediction.findUnique({
      where: { teamAuctionEntryId_auctionPlayerId: { teamAuctionEntryId, auctionPlayerId } },
    });
    await tx.auctionPlayerPrediction.upsert({
      where: { teamAuctionEntryId_auctionPlayerId: { teamAuctionEntryId, auctionPlayerId } },
      create: { teamAuctionEntryId, auctionPlayerId, predictedWinnerEntryId, predictedAmount, predictedMinAmount },
      update: { predictedWinnerEntryId, predictedAmount, predictedMinAmount },
    });
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry.auctionId,
      action: "PREDICTION_SAVED",
      actorUserId,
      before: existing
        ? {
            playerName: auctionPlayer.player.name,
            predictedWinnerEntryId: existing.predictedWinnerEntryId,
            predictedAmount: existing.predictedAmount?.toString() ?? null,
            predictedMinAmount: existing.predictedMinAmount?.toString() ?? null,
          }
        : null,
      after: {
        playerName: auctionPlayer.player.name,
        predictedWinnerEntryId,
        predictedAmount: predictedAmount?.toString() ?? null,
        predictedMinAmount: predictedMinAmount?.toString() ?? null,
      },
    });
  });
}

export async function removePrediction(teamAuctionEntryId: string, auctionPlayerId: string, actorUserId: string) {
  const [entry, existing] = await Promise.all([
    prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } }),
    prisma.auctionPlayerPrediction.findUnique({
      where: { teamAuctionEntryId_auctionPlayerId: { teamAuctionEntryId, auctionPlayerId } },
      include: { auctionPlayer: { include: { player: true } } },
    }),
  ]);
  if (!existing) return;

  await prisma.$transaction(async (tx) => {
    await tx.auctionPlayerPrediction.deleteMany({ where: { teamAuctionEntryId, auctionPlayerId } });
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry?.auctionId,
      action: "PREDICTION_REMOVED",
      actorUserId,
      before: {
        playerName: existing.auctionPlayer.player.name,
        predictedWinnerEntryId: existing.predictedWinnerEntryId,
        predictedAmount: existing.predictedAmount?.toString() ?? null,
        predictedMinAmount: existing.predictedMinAmount?.toString() ?? null,
      },
    });
  });
}
