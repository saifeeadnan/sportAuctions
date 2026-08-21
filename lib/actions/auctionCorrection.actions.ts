"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  correctSoldPrice,
  correctCategoryBasePrice,
  correctTeamBudget,
  type CorrectSoldPriceResult,
} from "@/lib/services/auctionCorrection.service";

function revalidateCorrectionPages(auctionId: string) {
  revalidatePath(`/admin/auctions/${auctionId}/correct-results`);
  revalidatePath(`/admin/auctions/${auctionId}/results`);
  revalidatePath(`/admin/auctions/${auctionId}/fantasy-teams`);
}

export async function correctSoldPriceAction(
  auctionId: string,
  auctionPlayerId: string,
  newPrice: number,
  confirmedTeamBudget?: number
): Promise<ActionResult<CorrectSoldPriceResult>> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    const result = await correctSoldPrice(
      auctionId,
      auctionPlayerId,
      newPrice,
      session.user.id,
      confirmedTeamBudget
    );
    if (result.status === "applied") revalidateCorrectionPages(auctionId);
    return result;
  });
}

export async function correctCategoryBasePriceAction(
  auctionId: string,
  categoryId: string,
  newBasePrice: number
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await correctCategoryBasePrice(auctionId, categoryId, newBasePrice, session.user.id);
    revalidateCorrectionPages(auctionId);
  });
}

export async function correctTeamBudgetAction(
  auctionId: string,
  newTeamBudget: number
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await correctTeamBudget(auctionId, newTeamBudget, session.user.id);
    revalidateCorrectionPages(auctionId);
  });
}
