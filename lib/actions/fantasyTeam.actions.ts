"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, allLeagueIds } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  submitFantasyTeam,
  deleteFantasyTeam,
  updateFantasyLockDate,
} from "@/lib/services/fantasyTeam.service";

export async function submitFantasyTeamAction(
  auctionId: string,
  auctionPlayerIds: string[],
  name?: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    await submitFantasyTeam(auctionId, session.user.id, auctionPlayerIds, allLeagueIds(session), name);
    revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
  });
}

export async function updateFantasyLockDateAction(
  auctionId: string,
  fantasyLockDate: string | null
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateFantasyLockDate(auctionId, fantasyLockDate ? new Date(fantasyLockDate) : null);
    revalidatePath(`/admin/auctions/${auctionId}/fantasy-teams`);
    revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
  });
}

export async function adminDeleteFantasyTeamAction(
  auctionId: string,
  fantasyTeamId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await deleteFantasyTeam(fantasyTeamId);
    revalidatePath(`/admin/auctions/${auctionId}/fantasy-teams`);
  });
}
