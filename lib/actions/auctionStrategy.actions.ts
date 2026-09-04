"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { saveStrategy, type StrategyBudgetTargetInput } from "@/lib/services/auctionStrategy.service";

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
