"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { setAnalyticsEnabled } from "@/lib/services/auctionAnalyticsEntitlement.service";

// Enabling auction analytics is a site-Admin-only capability — League Admins
// don't get a say in which teams see live bidding guidance.
export async function setAnalyticsEnabledAction(
  auctionId: string,
  teamAuctionEntryId: string,
  enabled: boolean
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("ADMIN");
    await loadScopedAuction(auctionId, null);
    await setAnalyticsEnabled(teamAuctionEntryId, enabled, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}/teams/${teamAuctionEntryId}`);
  });
}
