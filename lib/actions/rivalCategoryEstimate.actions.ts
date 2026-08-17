"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { upsertRivalCategoryEstimate } from "@/lib/services/rivalCategoryEstimate.service";

export async function saveRivalCategoryEstimateAction(
  teamAuctionEntryId: string,
  targetEntryId: string,
  categoryId: string,
  estimatedBudget: number | null
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

    await upsertRivalCategoryEstimate(teamAuctionEntryId, targetEntryId, categoryId, estimatedBudget);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/analytics-v2`);
  });
}
