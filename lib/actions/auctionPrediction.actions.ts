"use server";

import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { savePrediction, removePrediction } from "@/lib/services/auctionPrediction.service";

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
}

// No revalidatePath — like placeBidAction, the caller updates its own local
// predictions state after a successful call, so the projection board
// recomputes instantly without disrupting the live socket view.

export async function savePredictionAction(
  teamAuctionEntryId: string,
  auctionPlayerId: string,
  predictedWinnerEntryId: string,
  predictedAmount: number | null
): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    await savePrediction(teamAuctionEntryId, auctionPlayerId, predictedWinnerEntryId, predictedAmount);
  });
}

export async function removePredictionAction(
  teamAuctionEntryId: string,
  auctionPlayerId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    await removePrediction(teamAuctionEntryId, auctionPlayerId);
  });
}
