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
  /** True when the manager predicts nobody wins this player at all —
   * mutually exclusive with the three fields above, which are always null
   * whenever this is true. */
  predictedUnsold: boolean;
};

/** auctionPlayerId -> prediction, for the calling team only — predictions
 * are private and never visible to any other team. */
export async function getPredictionsForEntry(
  teamAuctionEntryId: string
): Promise<Record<string, PredictionEntry>> {
  const predictions = await prisma.auctionPlayerPrediction.findMany({
    where: { teamAuctionEntryId },
    select: {
      auctionPlayerId: true,
      predictedWinnerEntryId: true,
      predictedAmount: true,
      predictedMinAmount: true,
      predictedUnsold: true,
    },
  });
  return Object.fromEntries(
    predictions.map((p) => [
      p.auctionPlayerId,
      {
        predictedWinnerEntryId: p.predictedWinnerEntryId,
        predictedAmount: p.predictedAmount != null ? String(p.predictedAmount) : null,
        predictedMinAmount: p.predictedMinAmount != null ? String(p.predictedMinAmount) : null,
        predictedUnsold: p.predictedUnsold,
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
  predictedUnsold: boolean,
  actorUserId: string
) {
  if (predictedUnsold && (predictedWinnerEntryId != null || predictedAmount != null || predictedMinAmount != null)) {
    throw new ValidationError("A predicted-unsold guess can't also include a team or amount");
  }
  if (
    predictedWinnerEntryId == null &&
    predictedAmount == null &&
    predictedMinAmount == null &&
    !predictedUnsold
  ) {
    throw new ValidationError("A prediction needs at least a team, an amount, or a predicted-unsold guess");
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
      create: { teamAuctionEntryId, auctionPlayerId, predictedWinnerEntryId, predictedAmount, predictedMinAmount, predictedUnsold },
      update: { predictedWinnerEntryId, predictedAmount, predictedMinAmount, predictedUnsold },
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
            predictedUnsold: existing.predictedUnsold,
          }
        : null,
      after: {
        playerName: auctionPlayer.player.name,
        predictedWinnerEntryId,
        predictedAmount: predictedAmount?.toString() ?? null,
        predictedMinAmount: predictedMinAmount?.toString() ?? null,
        predictedUnsold,
      },
    });
  });
}

export type PredictionReplaceInput = {
  auctionPlayerId: string;
  predictedWinnerEntryId: string | null;
  predictedAmount: number | null;
  predictedMinAmount: number | null;
  predictedUnsold: boolean;
};

/**
 * Wipe-and-replace every prediction for this entry in one go — the bulk
 * counterpart to savePrediction/removePrediction's per-player edits, used by
 * savedStrategy.service.ts's loadSavedStrategy to restore a whole saved
 * snapshot at once (one summary audit row instead of one per player).
 * Predictions are "only meaningful for players reality hasn't already
 * answered for" (same reasoning savePrediction already applies) — a player
 * that's sold since the snapshot was saved is silently dropped rather than
 * failing the whole load, since that's an expected staleness, not an error.
 */
export async function replacePredictions(
  teamAuctionEntryId: string,
  predictions: PredictionReplaceInput[],
  actorUserId: string
) {
  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });
  if (!entry) throw new ValidationError("Team auction entry not found");

  const playerIds = Array.from(new Set(predictions.map((p) => p.auctionPlayerId)));
  const players = playerIds.length > 0
    ? await prisma.auctionPlayer.findMany({ where: { id: { in: playerIds }, auctionId: entry.auctionId } })
    : [];
  const playerById = new Map(players.map((p) => [p.id, p]));

  const winnerEntryIds = Array.from(
    new Set(predictions.map((p) => p.predictedWinnerEntryId).filter((id): id is string => id != null))
  );
  const validWinnerEntries = winnerEntryIds.length > 0
    ? await prisma.teamAuctionEntry.findMany({ where: { id: { in: winnerEntryIds }, auctionId: entry.auctionId }, select: { id: true } })
    : [];
  if (validWinnerEntries.length !== winnerEntryIds.length) {
    throw new ValidationError("One or more predicted teams do not belong to this auction");
  }

  const applicable = predictions.filter((p) => {
    const player = playerById.get(p.auctionPlayerId);
    return player != null && player.status !== "SOLD";
  });

  for (const p of applicable) {
    if (p.predictedWinnerEntryId === teamAuctionEntryId) {
      throw new ValidationError("You cannot predict your own team as the winner");
    }
    if (p.predictedUnsold && (p.predictedWinnerEntryId != null || p.predictedAmount != null || p.predictedMinAmount != null)) {
      throw new ValidationError("A predicted-unsold guess can't also include a team or amount");
    }
  }

  await prisma.$transaction(async (tx) => {
    const existingCount = await tx.auctionPlayerPrediction.count({ where: { teamAuctionEntryId } });
    await tx.auctionPlayerPrediction.deleteMany({ where: { teamAuctionEntryId } });
    if (applicable.length > 0) {
      await tx.auctionPlayerPrediction.createMany({
        data: applicable.map((p) => ({
          teamAuctionEntryId,
          auctionPlayerId: p.auctionPlayerId,
          predictedWinnerEntryId: p.predictedWinnerEntryId,
          predictedAmount: p.predictedAmount,
          predictedMinAmount: p.predictedMinAmount,
          predictedUnsold: p.predictedUnsold,
        })),
      });
    }
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry.auctionId,
      action: "PREDICTIONS_REPLACED",
      actorUserId,
      before: { predictionCount: existingCount },
      after: { predictionCount: applicable.length },
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
        predictedUnsold: existing.predictedUnsold,
      },
    });
  });
}
