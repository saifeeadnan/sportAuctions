"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { assignTeamCaptain } from "@/lib/services/teamCaptain.service";

export async function assignTeamCaptainAction(
  auctionId: string,
  teamAuctionEntryId: string,
  auctionPlayerId: string | null
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await assignTeamCaptain(auctionId, teamAuctionEntryId, auctionPlayerId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}/results`);
  });
}
