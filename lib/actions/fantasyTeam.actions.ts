"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { submitFantasyTeam, deleteFantasyTeam } from "@/lib/services/fantasyTeam.service";

export async function submitFantasyTeamAction(auctionId: string, auctionPlayerIds: string[]) {
  const session = await requireRole("VIEWER", "TEAM_MANAGER");
  await submitFantasyTeam(auctionId, session.user.id, auctionPlayerIds, scopeLeagueId(session));
  revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
}

export async function adminDeleteFantasyTeamAction(auctionId: string, fantasyTeamId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await deleteFantasyTeam(fantasyTeamId);
  revalidatePath(`/admin/auctions/${auctionId}/fantasy-teams`);
}
