import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";

export type StrategyBudgetTargetInput = { categoryId: string; targetAvgPrice: number };

export type Strategy = {
  mustHaveIds: string[];
  avoidIds: string[];
  budgetTargets: { categoryId: string; targetAvgPrice: string }[];
};

export async function getStrategyForEntry(teamAuctionEntryId: string): Promise<Strategy> {
  const [preferences, budgetTargets] = await Promise.all([
    prisma.auctionPlayerPreference.findMany({ where: { teamAuctionEntryId } }),
    prisma.auctionCategoryBudgetTarget.findMany({ where: { teamAuctionEntryId } }),
  ]);

  return {
    mustHaveIds: preferences.filter((p) => p.type === "MUST_HAVE").map((p) => p.auctionPlayerId),
    avoidIds: preferences.filter((p) => p.type === "AVOID").map((p) => p.auctionPlayerId),
    budgetTargets: budgetTargets.map((t) => ({
      categoryId: t.categoryId,
      targetAvgPrice: String(t.targetAvgPrice),
    })),
  };
}

/**
 * Wipe-and-replace, same pattern as preAuctionDraft.service.ts's submitDraft —
 * editable any time before the auction concludes, including live during
 * BIDDING, so a manager can adjust must-haves/avoids/budget targets as the
 * room evolves (a rival's roster becomes clearer, a target already sold,
 * etc.) rather than being locked into a pre-auction snapshot.
 */
export async function saveStrategy(
  teamAuctionEntryId: string,
  mustHaveIds: string[],
  avoidIds: string[],
  budgetTargets: StrategyBudgetTargetInput[],
  actorUserId: string
) {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: { auction: true },
  });
  if (!entry) throw new ValidationError("Team auction entry not found");

  if (entry.auction.status === "COMPLETED") {
    throw new InvalidStateTransitionError("Cannot change strategy once the auction has concluded");
  }

  const mustHaveSet = new Set(mustHaveIds);
  const avoidSet = new Set(avoidIds);
  if (mustHaveIds.some((id) => avoidSet.has(id))) {
    throw new ValidationError("A player cannot be both a must-have and an avoid");
  }

  const playerIds = Array.from(new Set([...mustHaveSet, ...avoidSet]));
  if (playerIds.length > 0) {
    const validPlayers = await prisma.auctionPlayer.findMany({
      where: { id: { in: playerIds }, auctionId: entry.auctionId },
      select: { id: true },
    });
    if (validPlayers.length !== playerIds.length) {
      throw new ValidationError("One or more selected players do not belong to this auction");
    }
  }

  const categoryIds = Array.from(new Set(budgetTargets.map((t) => t.categoryId)));
  if (categoryIds.length > 0) {
    const validCategories = await prisma.auctionCategory.findMany({
      where: { id: { in: categoryIds }, auctionId: entry.auctionId },
      select: { id: true },
    });
    if (validCategories.length !== categoryIds.length) {
      throw new ValidationError("One or more categories do not belong to this auction");
    }
  }
  if (categoryIds.length !== budgetTargets.length) {
    throw new ValidationError("A category can only have one budget target");
  }
  for (const target of budgetTargets) {
    if (target.targetAvgPrice <= 0) {
      throw new ValidationError("Budget target must be greater than 0");
    }
  }

  await prisma.$transaction(async (tx) => {
    const existingPreferences = await tx.auctionPlayerPreference.findMany({ where: { teamAuctionEntryId } });
    const existingBudgetTargets = await tx.auctionCategoryBudgetTarget.findMany({ where: { teamAuctionEntryId } });

    await tx.auctionPlayerPreference.deleteMany({ where: { teamAuctionEntryId } });
    const preferenceRows = [
      ...mustHaveIds.map((auctionPlayerId) => ({
        teamAuctionEntryId,
        auctionPlayerId,
        type: "MUST_HAVE" as const,
      })),
      ...avoidIds.map((auctionPlayerId) => ({
        teamAuctionEntryId,
        auctionPlayerId,
        type: "AVOID" as const,
      })),
    ];
    if (preferenceRows.length > 0) {
      await tx.auctionPlayerPreference.createMany({ data: preferenceRows });
    }

    await tx.auctionCategoryBudgetTarget.deleteMany({ where: { teamAuctionEntryId } });
    if (budgetTargets.length > 0) {
      await tx.auctionCategoryBudgetTarget.createMany({
        data: budgetTargets.map((t) => ({
          teamAuctionEntryId,
          categoryId: t.categoryId,
          targetAvgPrice: t.targetAvgPrice,
        })),
      });
    }

    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry.auctionId,
      action: "STRATEGY_SAVED",
      actorUserId,
      before: {
        mustHaveCount: existingPreferences.filter((p) => p.type === "MUST_HAVE").length,
        avoidCount: existingPreferences.filter((p) => p.type === "AVOID").length,
        budgetTargetCount: existingBudgetTargets.length,
      },
      after: {
        mustHaveCount: mustHaveIds.length,
        avoidCount: avoidIds.length,
        budgetTargetCount: budgetTargets.length,
      },
    });
  });
}
