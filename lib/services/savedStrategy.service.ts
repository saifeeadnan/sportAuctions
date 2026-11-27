import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import { getStrategyForEntry, saveStrategy } from "@/lib/services/auctionStrategy.service";
import { getRivalCategoryEstimates, replaceRivalCategoryEstimates } from "@/lib/services/rivalCategoryEstimate.service";
import { getPredictionsForEntry, replacePredictions } from "@/lib/services/auctionPrediction.service";

export type SavedStrategySummary = { id: string; name: string; updatedAt: Date };

type StoredBudgetTarget = { categoryId: string; targetAvgPrice: string };
type StoredRivalEstimate = { targetEntryId: string; categoryId: string; estimatedBudget: string };
type StoredPrediction = {
  playerId: string;
  predictedWinnerEntryId: string | null;
  predictedAmount: string | null;
  predictedMinAmount: string | null;
  predictedUnsold: boolean;
};

export type SavedStrategyDetail = {
  id: string;
  name: string;
  mustHaveIds: string[];
  avoidIds: string[];
  budgetTargets: StoredBudgetTarget[];
  rivalEstimates: StoredRivalEstimate[];
  predictions: StoredPrediction[];
  updatedAt: Date;
};

export async function listSavedStrategies(teamAuctionEntryId: string): Promise<SavedStrategySummary[]> {
  return prisma.savedAuctionStrategy.findMany({
    where: { teamAuctionEntryId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  });
}

async function getOwnedSavedStrategy(teamAuctionEntryId: string, savedStrategyId: string) {
  const row = await prisma.savedAuctionStrategy.findUnique({ where: { id: savedStrategyId } });
  if (!row || row.teamAuctionEntryId !== teamAuctionEntryId) {
    throw new ValidationError("Saved strategy not found");
  }
  return row;
}

export async function getSavedStrategy(teamAuctionEntryId: string, savedStrategyId: string): Promise<SavedStrategyDetail> {
  const row = await getOwnedSavedStrategy(teamAuctionEntryId, savedStrategyId);
  return {
    id: row.id,
    name: row.name,
    mustHaveIds: row.mustHaveIds as unknown as string[],
    avoidIds: row.avoidIds as unknown as string[],
    budgetTargets: row.budgetTargets as unknown as StoredBudgetTarget[],
    rivalEstimates: row.rivalEstimates as unknown as StoredRivalEstimate[],
    predictions: row.predictions as unknown as StoredPrediction[],
    updatedAt: row.updatedAt,
  };
}

/**
 * Captures the manager's current live state (must-haves/avoids/budget
 * targets via the existing getStrategyForEntry, rival estimates and
 * predictions via their own existing getters) and upserts it under `name` —
 * saving under an existing name overwrites it, per the unique constraint on
 * [teamAuctionEntryId, name]. Also marks this as the entry's active saved
 * strategy, which is what getStrategyDirtyState compares live state against
 * going forward.
 */
export async function saveCurrentAsStrategy(
  teamAuctionEntryId: string,
  name: string,
  actorUserId: string
): Promise<{ id: string }> {
  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 60) {
    throw new ValidationError("Strategy name must be between 1 and 60 characters");
  }

  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });
  if (!entry) throw new ValidationError("Team auction entry not found");

  const [strategy, rivalEstimates, predictions] = await Promise.all([
    getStrategyForEntry(teamAuctionEntryId),
    getRivalCategoryEstimates(teamAuctionEntryId),
    getPredictionsForEntry(teamAuctionEntryId),
  ]);

  const predictionsArray: StoredPrediction[] = Object.entries(predictions).map(([playerId, p]) => ({
    playerId,
    predictedWinnerEntryId: p.predictedWinnerEntryId,
    predictedAmount: p.predictedAmount,
    predictedMinAmount: p.predictedMinAmount,
    predictedUnsold: p.predictedUnsold,
  }));

  const saved = await prisma.$transaction(async (tx) => {
    const row = await tx.savedAuctionStrategy.upsert({
      where: { teamAuctionEntryId_name: { teamAuctionEntryId, name: trimmedName } },
      create: {
        teamAuctionEntryId,
        name: trimmedName,
        mustHaveIds: strategy.mustHaveIds,
        avoidIds: strategy.avoidIds,
        budgetTargets: strategy.budgetTargets,
        rivalEstimates,
        predictions: predictionsArray,
      },
      update: {
        mustHaveIds: strategy.mustHaveIds,
        avoidIds: strategy.avoidIds,
        budgetTargets: strategy.budgetTargets,
        rivalEstimates,
        predictions: predictionsArray,
      },
    });
    await tx.teamAuctionEntry.update({ where: { id: teamAuctionEntryId }, data: { activeSavedStrategyId: row.id } });
    await writeAuditLog(tx, {
      entityType: "SavedAuctionStrategy",
      entityId: row.id,
      auctionId: entry.auctionId,
      action: "SAVED_STRATEGY_SAVED",
      actorUserId,
      after: {
        name: trimmedName,
        mustHaveCount: strategy.mustHaveIds.length,
        avoidCount: strategy.avoidIds.length,
        budgetTargetCount: strategy.budgetTargets.length,
        rivalEstimateCount: rivalEstimates.length,
        predictionCount: predictionsArray.length,
      },
    });
    return row;
  });

  return { id: saved.id };
}

/**
 * Overwrites live must-haves/avoids/budget-targets/rival-estimates/
 * predictions with a saved snapshot — reusing the existing saveStrategy
 * (must-haves/avoids/budget targets) and the new replaceRivalCategoryEstimates
 * / replacePredictions bulk-replace functions as-is, rather than duplicating
 * their validation. Not fully atomic across the three (each commits its own
 * transaction) — accepted since this is a non-financial, UI-convenience
 * feature where every step is idempotent and safe to retry.
 */
export async function loadSavedStrategy(
  teamAuctionEntryId: string,
  savedStrategyId: string,
  actorUserId: string
): Promise<void> {
  const row = await getOwnedSavedStrategy(teamAuctionEntryId, savedStrategyId);
  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });
  if (!entry) throw new ValidationError("Team auction entry not found");

  const mustHaveIds = row.mustHaveIds as unknown as string[];
  const avoidIds = row.avoidIds as unknown as string[];
  const budgetTargets = (row.budgetTargets as unknown as StoredBudgetTarget[]).map((t) => ({
    categoryId: t.categoryId,
    targetAvgPrice: Number(t.targetAvgPrice),
  }));
  const rivalEstimates = (row.rivalEstimates as unknown as StoredRivalEstimate[]).map((e) => ({
    targetEntryId: e.targetEntryId,
    categoryId: e.categoryId,
    estimatedBudget: Number(e.estimatedBudget),
  }));
  const predictions = (row.predictions as unknown as StoredPrediction[]).map((p) => ({
    auctionPlayerId: p.playerId,
    predictedWinnerEntryId: p.predictedWinnerEntryId,
    predictedAmount: p.predictedAmount != null ? Number(p.predictedAmount) : null,
    predictedMinAmount: p.predictedMinAmount != null ? Number(p.predictedMinAmount) : null,
    predictedUnsold: p.predictedUnsold,
  }));

  await saveStrategy(teamAuctionEntryId, mustHaveIds, avoidIds, budgetTargets, actorUserId);
  await replaceRivalCategoryEstimates(teamAuctionEntryId, rivalEstimates, actorUserId);
  await replacePredictions(teamAuctionEntryId, predictions, actorUserId);

  await prisma.$transaction(async (tx) => {
    await tx.teamAuctionEntry.update({ where: { id: teamAuctionEntryId }, data: { activeSavedStrategyId: row.id } });
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry.auctionId,
      action: "SAVED_STRATEGY_LOADED",
      actorUserId,
      after: {
        loadedStrategyName: row.name,
        mustHaveCount: mustHaveIds.length,
        avoidCount: avoidIds.length,
        budgetTargetCount: budgetTargets.length,
        rivalEstimateCount: rivalEstimates.length,
        predictionCount: predictions.length,
      },
    });
  });
}

export async function deleteSavedStrategy(
  teamAuctionEntryId: string,
  savedStrategyId: string,
  actorUserId: string
): Promise<void> {
  const row = await getOwnedSavedStrategy(teamAuctionEntryId, savedStrategyId);
  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });

  await prisma.$transaction(async (tx) => {
    await tx.savedAuctionStrategy.delete({ where: { id: savedStrategyId } });
    await writeAuditLog(tx, {
      entityType: "SavedAuctionStrategy",
      entityId: savedStrategyId,
      auctionId: entry?.auctionId,
      action: "SAVED_STRATEGY_DELETED",
      actorUserId,
      before: { name: row.name },
    });
  });
}

export type StrategyDirtyState = { dirty: boolean; activeStrategyName: string | null };

/**
 * Whether live state has drifted from the entry's active saved strategy
 * (or, with no active strategy, whether there's any live state at all) --
 * a pure DB-state comparison, not a client-form-dirty check, since every
 * must-have/avoid toggle and budget/estimate/prediction field already
 * autosaves the instant it's edited (see multiple-strategy-plan.md's "Why
 * the dirty check can be a pure DB-state comparison" section).
 */
export async function getStrategyDirtyState(teamAuctionEntryId: string): Promise<StrategyDirtyState> {
  const entry = await prisma.teamAuctionEntry.findUnique({ where: { id: teamAuctionEntryId } });
  if (!entry) throw new ValidationError("Team auction entry not found");

  const [strategy, rivalEstimates, predictions] = await Promise.all([
    getStrategyForEntry(teamAuctionEntryId),
    getRivalCategoryEstimates(teamAuctionEntryId),
    getPredictionsForEntry(teamAuctionEntryId),
  ]);
  const predictionCount = Object.keys(predictions).length;

  if (entry.activeSavedStrategyId == null) {
    const liveIsEmpty =
      strategy.mustHaveIds.length === 0 &&
      strategy.avoidIds.length === 0 &&
      strategy.budgetTargets.length === 0 &&
      rivalEstimates.length === 0 &&
      predictionCount === 0;
    return { dirty: !liveIsEmpty, activeStrategyName: null };
  }

  const active = await prisma.savedAuctionStrategy.findUnique({ where: { id: entry.activeSavedStrategyId } });
  if (!active) {
    // Pointer somehow stale (shouldn't happen given onDelete: SetNull) --
    // treat as "nothing active" rather than throwing.
    return { dirty: true, activeStrategyName: null };
  }

  const dirty = !isSameStrategy(active, strategy, rivalEstimates, predictions);
  return { dirty, activeStrategyName: active.name };
}

function idSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, i) => id === sortedB[i]);
}

function numberMapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

function numOrNull(v: string | null): number | null {
  return v == null ? null : Number(v);
}

function isSameStrategy(
  active: {
    mustHaveIds: unknown;
    avoidIds: unknown;
    budgetTargets: unknown;
    rivalEstimates: unknown;
    predictions: unknown;
  },
  liveStrategy: { mustHaveIds: string[]; avoidIds: string[]; budgetTargets: StoredBudgetTarget[] },
  liveRivalEstimates: StoredRivalEstimate[],
  livePredictions: Record<
    string,
    { predictedWinnerEntryId: string | null; predictedAmount: string | null; predictedMinAmount: string | null; predictedUnsold: boolean }
  >
): boolean {
  const activeMustHaveIds = active.mustHaveIds as unknown as string[];
  const activeAvoidIds = active.avoidIds as unknown as string[];
  const activeBudgetTargets = active.budgetTargets as unknown as StoredBudgetTarget[];
  const activeRivalEstimates = active.rivalEstimates as unknown as StoredRivalEstimate[];
  const activePredictions = active.predictions as unknown as StoredPrediction[];

  if (!idSetsEqual(activeMustHaveIds, liveStrategy.mustHaveIds)) return false;
  if (!idSetsEqual(activeAvoidIds, liveStrategy.avoidIds)) return false;

  const activeBudgetMap = new Map(activeBudgetTargets.map((t) => [t.categoryId, Number(t.targetAvgPrice)]));
  const liveBudgetMap = new Map(liveStrategy.budgetTargets.map((t) => [t.categoryId, Number(t.targetAvgPrice)]));
  if (!numberMapsEqual(activeBudgetMap, liveBudgetMap)) return false;

  const activeRivalMap = new Map(
    activeRivalEstimates.map((e) => [`${e.targetEntryId}:${e.categoryId}`, Number(e.estimatedBudget)])
  );
  const liveRivalMap = new Map(
    liveRivalEstimates.map((e) => [`${e.targetEntryId}:${e.categoryId}`, Number(e.estimatedBudget)])
  );
  if (!numberMapsEqual(activeRivalMap, liveRivalMap)) return false;

  const livePlayerIds = Object.keys(livePredictions);
  if (activePredictions.length !== livePlayerIds.length) return false;
  for (const p of activePredictions) {
    const live = livePredictions[p.playerId];
    if (!live) return false;
    if (p.predictedWinnerEntryId !== live.predictedWinnerEntryId) return false;
    if (p.predictedUnsold !== live.predictedUnsold) return false;
    if (numOrNull(p.predictedAmount) !== numOrNull(live.predictedAmount)) return false;
    if (numOrNull(p.predictedMinAmount) !== numOrNull(live.predictedMinAmount)) return false;
  }

  return true;
}
