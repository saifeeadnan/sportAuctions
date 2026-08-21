"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { getOrCreateHighlightsToken } from "@/lib/services/auctionHighlights.service";

export async function generateHighlightsLinkAction(
  auctionId: string
): Promise<ActionResult<{ token: string }>> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    const token = await getOrCreateHighlightsToken(auctionId);
    revalidatePath(`/admin/auctions/${auctionId}`);
    return { token };
  });
}
