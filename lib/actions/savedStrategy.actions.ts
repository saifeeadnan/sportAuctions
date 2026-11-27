"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  saveCurrentAsStrategy,
  loadSavedStrategy,
  deleteSavedStrategy,
  getStrategyDirtyState,
} from "@/lib/services/savedStrategy.service";

async function requireOwnedAnalyticsEntry(teamAuctionEntryId: string) {
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
  return { session, entry };
}

export async function saveCurrentAsStrategyAction(
  teamAuctionEntryId: string,
  name: string
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const { session } = await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    const result = await saveCurrentAsStrategy(teamAuctionEntryId, name, session.user.id);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/analytics-v2`);
    return result;
  });
}

export async function loadSavedStrategyAction(
  teamAuctionEntryId: string,
  savedStrategyId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session } = await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    await loadSavedStrategy(teamAuctionEntryId, savedStrategyId, session.user.id);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/analytics-v2`);
  });
}

export async function deleteSavedStrategyAction(
  teamAuctionEntryId: string,
  savedStrategyId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session } = await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    await deleteSavedStrategy(teamAuctionEntryId, savedStrategyId, session.user.id);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/analytics-v2`);
  });
}

export async function getStrategyDirtyStateAction(
  teamAuctionEntryId: string
): Promise<ActionResult<{ dirty: boolean; activeStrategyName: string | null }>> {
  return toActionResult(async () => {
    await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    return getStrategyDirtyState(teamAuctionEntryId);
  });
}
