import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";

export type RivalCategoryEstimateEntry = { targetEntryId: string; categoryId: string; estimatedBudget: string };
export type RivalCategoryEstimateInput = { targetEntryId: string; categoryId: string; estimatedBudget: number };

export async function getRivalCategoryEstimates(teamAuctionEntryId: string): Promise<RivalCategoryEstimateEntry[]> {
  const rows = await prisma.rivalCategoryBudgetEstimate.findMany({ where: { teamAuctionEntryId } });
  return rows.map((r) => ({
    targetEntryId: r.targetEntryId,
    categoryId: r.categoryId,
    estimatedBudget: String(r.estimatedBudget),
  }));
}

/**
 * Set (or clear, when `estimatedBudget` is null) this manager's own private
 * estimate of one team's budget for one category — a single upsert/delete,
 * not a wipe-and-replace of the whole set, since these are edited one cell
 * at a time from the panel rather than submitted as a full form.
 */
export async function upsertRivalCategoryEstimate(
  teamAuctionEntryId: string,
  targetEntryId: string,
  categoryId: string,
  estimatedBudget: number | null,
  actorUserId: string
) {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    select: { auctionId: true },
  });
  if (!entry) throw new ValidationError("Team auction entry not found");

  const [targetEntry, category] = await Promise.all([
    prisma.teamAuctionEntry.findFirst({
      where: { id: targetEntryId, auctionId: entry.auctionId },
      include: { team: true },
    }),
    prisma.auctionCategory.findFirst({ where: { id: categoryId, auctionId: entry.auctionId } }),
  ]);
  if (!targetEntry) throw new ValidationError("Team does not belong to this auction");
  if (!category) throw new ValidationError("Category does not belong to this auction");

  const existing = await prisma.rivalCategoryBudgetEstimate.findUnique({
    where: { teamAuctionEntryId_targetEntryId_categoryId: { teamAuctionEntryId, targetEntryId, categoryId } },
  });
  const cellLabel = `${targetEntry.team.name} / ${category.name}`;

  if (estimatedBudget == null) {
    if (!existing) return;
    await prisma.$transaction(async (tx) => {
      await tx.rivalCategoryBudgetEstimate.deleteMany({
        where: { teamAuctionEntryId, targetEntryId, categoryId },
      });
      await writeAuditLog(tx, {
        entityType: "TeamAuctionEntry",
        entityId: teamAuctionEntryId,
        auctionId: entry.auctionId,
        action: "RIVAL_ESTIMATE_REMOVED",
        actorUserId,
        before: { cell: cellLabel, estimatedBudget: existing.estimatedBudget.toString() },
      });
    });
    return;
  }

  if (estimatedBudget < 0) throw new ValidationError("Estimated budget cannot be negative");

  await prisma.$transaction(async (tx) => {
    await tx.rivalCategoryBudgetEstimate.upsert({
      where: {
        teamAuctionEntryId_targetEntryId_categoryId: { teamAuctionEntryId, targetEntryId, categoryId },
      },
      create: { teamAuctionEntryId, targetEntryId, categoryId, estimatedBudget },
      update: { estimatedBudget },
    });
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry.auctionId,
      action: "RIVAL_ESTIMATE_SAVED",
      actorUserId,
      before: existing ? { cell: cellLabel, estimatedBudget: existing.estimatedBudget.toString() } : null,
      after: { cell: cellLabel, estimatedBudget: estimatedBudget.toString() },
    });
  });
}

/**
 * Wipe-and-replace every rival category estimate for this entry in one go —
 * the bulk counterpart to upsertRivalCategoryEstimate's single-cell edits,
 * used by savedStrategy.service.ts's loadSavedStrategy to restore a whole
 * saved snapshot at once (one summary audit row instead of one per cell).
 * Mirrors saveStrategy's wipe-and-replace shape in auctionStrategy.service.ts.
 */
export async function replaceRivalCategoryEstimates(
  teamAuctionEntryId: string,
  estimates: RivalCategoryEstimateInput[],
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

  const targetEntryIds = Array.from(new Set(estimates.map((e) => e.targetEntryId)));
  const categoryIds = Array.from(new Set(estimates.map((e) => e.categoryId)));
  const [validTargetEntries, validCategories] = await Promise.all([
    targetEntryIds.length > 0
      ? prisma.teamAuctionEntry.findMany({ where: { id: { in: targetEntryIds }, auctionId: entry.auctionId }, select: { id: true } })
      : [],
    categoryIds.length > 0
      ? prisma.auctionCategory.findMany({ where: { id: { in: categoryIds }, auctionId: entry.auctionId }, select: { id: true } })
      : [],
  ]);
  if (validTargetEntries.length !== targetEntryIds.length) {
    throw new ValidationError("One or more teams do not belong to this auction");
  }
  if (validCategories.length !== categoryIds.length) {
    throw new ValidationError("One or more categories do not belong to this auction");
  }

  const seenCells = new Set<string>();
  for (const e of estimates) {
    const key = `${e.targetEntryId}:${e.categoryId}`;
    if (seenCells.has(key)) throw new ValidationError("A team/category pair can only have one estimate");
    seenCells.add(key);
    if (e.estimatedBudget < 0) throw new ValidationError("Estimated budget cannot be negative");
  }

  await prisma.$transaction(async (tx) => {
    const existingCount = await tx.rivalCategoryBudgetEstimate.count({ where: { teamAuctionEntryId } });
    await tx.rivalCategoryBudgetEstimate.deleteMany({ where: { teamAuctionEntryId } });
    if (estimates.length > 0) {
      await tx.rivalCategoryBudgetEstimate.createMany({
        data: estimates.map((e) => ({
          teamAuctionEntryId,
          targetEntryId: e.targetEntryId,
          categoryId: e.categoryId,
          estimatedBudget: e.estimatedBudget,
        })),
      });
    }
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: teamAuctionEntryId,
      auctionId: entry.auctionId,
      action: "RIVAL_ESTIMATES_REPLACED",
      actorUserId,
      before: { estimateCount: existingCount },
      after: { estimateCount: estimates.length },
    });
  });
}
