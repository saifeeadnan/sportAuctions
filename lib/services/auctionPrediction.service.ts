import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";

export type PredictionEntry = {
  predictedWinnerEntryId: string;
  /** This manager's own guess at what the winner would pay — optional. */
  predictedAmount: string | null;
};

/** auctionPlayerId -> prediction, for the calling team only — predictions
 * are private and never visible to any other team. */
export async function getPredictionsForEntry(
  teamAuctionEntryId: string
): Promise<Record<string, PredictionEntry>> {
  const predictions = await prisma.auctionPlayerPrediction.findMany({
    where: { teamAuctionEntryId },
    select: { auctionPlayerId: true, predictedWinnerEntryId: true, predictedAmount: true },
  });
  return Object.fromEntries(
    predictions.map((p) => [
      p.auctionPlayerId,
      {
        predictedWinnerEntryId: p.predictedWinnerEntryId,
        predictedAmount: p.predictedAmount != null ? String(p.predictedAmount) : null,
      },
    ])
  );
}

export async function savePrediction(
  teamAuctionEntryId: string,
  auctionPlayerId: string,
  predictedWinnerEntryId: string,
  predictedAmount: number | null,
  actorUserId: string
) {
  if (predictedWinnerEntryId === teamAuctionEntryId) {
    throw new ValidationError("You cannot predict your own team as the winner");
  }
  if (predictedAmount != null && predictedAmount <= 0) {
    throw new ValidationError("Predicted amount must be greater than 0");
  }

  const [entry, auctionPlayer, winnerEntry] = await Promise.all([
    prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } }),
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId }, include: { player: true } }),
    prisma.teamAuctionEntry.findUnique({ where: { id: predictedWinnerEntryId } }),
  ]);
  if (!entry) throw new ValidationError("Team auction entry not found");
  if (!auctionPlayer || auctionPlayer.auctionId !== entry.auctionId) {
    throw new ValidationError("Player not found in this auction");
  }
  if (!winnerEntry || winnerEntry.auctionId !== entry.auctionId) {
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
      create: { teamAuctionEntryId, auctionPlayerId, predictedWinnerEntryId, predictedAmount },
      update: { predictedWinnerEntryId, predictedAmount },
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
          }
        : null,
      after: {
        playerName: auctionPlayer.player.name,
        predictedWinnerEntryId,
        predictedAmount: predictedAmount?.toString() ?? null,
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
      },
    });
  });
}
