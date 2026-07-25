"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { submitFantasyTeam, deleteFantasyTeam } from "@/lib/services/fantasyTeam.service";

export async function submitFantasyTeamAction(auctionId: string, auctionPlayerIds: string[]) {
  const session = await requireRole("VIEWER");
  await submitFantasyTeam(auctionId, session.user.id, auctionPlayerIds);
  revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
}

export async function adminDeleteFantasyTeamAction(auctionId: string, fantasyTeamId: string) {
  await requireRole("ADMIN");
  await deleteFantasyTeam(fantasyTeamId);
  revalidatePath(`/admin/auctions/${auctionId}/fantasy-teams`);
}
