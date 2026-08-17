import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type RivalCategoryEstimateEntry = { targetEntryId: string; categoryId: string; estimatedBudget: string };

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
  estimatedBudget: number | null
) {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    select: { auctionId: true },
  });
  if (!entry) throw new ValidationError("Team auction entry not found");

  const [targetEntry, category] = await Promise.all([
    prisma.teamAuctionEntry.findFirst({ where: { id: targetEntryId, auctionId: entry.auctionId }, select: { id: true } }),
    prisma.auctionCategory.findFirst({ where: { id: categoryId, auctionId: entry.auctionId }, select: { id: true } }),
  ]);
  if (!targetEntry) throw new ValidationError("Team does not belong to this auction");
  if (!category) throw new ValidationError("Category does not belong to this auction");

  if (estimatedBudget == null) {
    await prisma.rivalCategoryBudgetEstimate.deleteMany({
      where: { teamAuctionEntryId, targetEntryId, categoryId },
    });
    return;
  }

  if (estimatedBudget < 0) throw new ValidationError("Estimated budget cannot be negative");

  await prisma.rivalCategoryBudgetEstimate.upsert({
    where: {
      teamAuctionEntryId_targetEntryId_categoryId: { teamAuctionEntryId, targetEntryId, categoryId },
    },
    create: { teamAuctionEntryId, targetEntryId, categoryId, estimatedBudget },
    update: { estimatedBudget },
  });
}
