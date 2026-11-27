"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  saveStrategy,
  upsertCategoryBudgetTarget,
  type StrategyBudgetTargetInput,
} from "@/lib/services/auctionStrategy.service";

export async function saveStrategyAction(
  teamAuctionEntryId: string,
  mustHaveIds: string[],
  avoidIds: string[],
  budgetTargets: StrategyBudgetTargetInput[]
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("TEAM_MANAGER");

    const entry = await prisma.teamAuctionEntry.findUnique({
      where: { id: teamAuctionEntryId },
      include: { team: true },
    });
    if (!entry || entry.team.managerId !== session.user.id) {
      throw new ValidationError("You do not manage this team");
    }
    if (!entry.analyticsEnabled) {
      throw new ValidationError("The analytics dashboard is not enabled for this team");
    }

    await saveStrategy(teamAuctionEntryId, mustHaveIds, avoidIds, budgetTargets, session.user.id);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/strategy`);
  });
}

/**
 * One cell of the manager's own budget target per category — used by the
 * merged "My estimates" grid's self row (same per-cell edit UX as a rival
 * estimate), without wiping must-haves/avoids/other categories the way
 * saveStrategyAction's whole-form submit would.
 */
export async function saveCategoryBudgetTargetAction(
  teamAuctionEntryId: string,
  categoryId: string,
  targetAvgPrice: number | null
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("TEAM_MANAGER");

    const entry = await prisma.teamAuctionEntry.findUnique({
      where: { id: teamAuctionEntryId },
      include: { team: true },
    });
    if (!entry || entry.team.managerId !== session.user.id) {
      throw new ValidationError("You do not manage this team");
    }
    if (!entry.analyticsEnabled) {
      throw new ValidationError("The analytics dashboard is not enabled for this team");
    }

    await upsertCategoryBudgetTarget(teamAuctionEntryId, categoryId, targetAvgPrice, session.user.id);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/analytics-v2`);
  });
}
