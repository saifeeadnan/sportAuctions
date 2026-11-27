"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  saveStrategy,
  upsertPlayerPreference,
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
 * One player's MUST_HAVE/AVOID tag — used by the Wish list picker to
 * autosave each toggle immediately (matching how Predictions already
 * behaves), instead of batching every toggle behind saveStrategyAction's
 * whole-form submit. Revalidates both dashboards since StrategyForm is
 * shared by v1's AnalyticsDashboardPage and v2's AnalyticsV2Dashboard.
 */
export async function setPlayerPreferenceAction(
  teamAuctionEntryId: string,
  auctionPlayerId: string,
  type: "MUST_HAVE" | "AVOID" | null
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

    await upsertPlayerPreference(teamAuctionEntryId, auctionPlayerId, type, session.user.id);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/analytics`);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/analytics-v2`);
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
