"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { setAnalyticsEnabled } from "@/lib/services/auctionAnalyticsEntitlement.service";

export async function setAnalyticsEnabledAction(
  auctionId: string,
  teamAuctionEntryId: string,
  enabled: boolean
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await setAnalyticsEnabled(teamAuctionEntryId, enabled);
  revalidatePath(`/admin/auctions/${auctionId}/teams/${teamAuctionEntryId}`);
}
