import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

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
  predictedAmount: number | null
) {
  if (predictedWinnerEntryId === teamAuctionEntryId) {
    throw new ValidationError("You cannot predict your own team as the winner");
  }
  if (predictedAmount != null && predictedAmount <= 0) {
    throw new ValidationError("Predicted amount must be greater than 0");
  }

  const [entry, auctionPlayer, winnerEntry] = await Promise.all([
    prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } }),
    prisma.auctionPlayer.findUnique({ where: { id: auctionPlayerId } }),
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

  await prisma.auctionPlayerPrediction.upsert({
    where: { teamAuctionEntryId_auctionPlayerId: { teamAuctionEntryId, auctionPlayerId } },
    create: { teamAuctionEntryId, auctionPlayerId, predictedWinnerEntryId, predictedAmount },
    update: { predictedWinnerEntryId, predictedAmount },
  });
}

export async function removePrediction(teamAuctionEntryId: string, auctionPlayerId: string) {
  await prisma.auctionPlayerPrediction.deleteMany({ where: { teamAuctionEntryId, auctionPlayerId } });
}
