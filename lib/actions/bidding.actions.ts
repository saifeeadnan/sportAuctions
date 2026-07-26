"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import {
  selectNextPlayer,
  recordSale,
  markUnsold,
  concludeAuction,
  adminAssignPlayer,
  removePlayerFromTeam,
} from "@/lib/services/bidding.service";

export async function selectNextPlayerAction(auctionId: string, auctionPlayerId: string) {
  const session = await requireRole("AUCTIONEER", "ADMIN");
  await loadScopedAuction(auctionId, scopeLeagueId(session));
  await selectNextPlayer(auctionId, auctionPlayerId);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function recordSaleAction(
  auctionId: string,
  auctionPlayerId: string,
  winningTeamAuctionEntryId: string,
  price: number
) {
  const session = await requireRole("AUCTIONEER", "ADMIN");
  await loadScopedAuction(auctionId, scopeLeagueId(session));
  await recordSale(auctionId, auctionPlayerId, winningTeamAuctionEntryId, price);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function markUnsoldAction(auctionId: string, auctionPlayerId: string) {
  const session = await requireRole("AUCTIONEER", "ADMIN");
  await loadScopedAuction(auctionId, scopeLeagueId(session));
  await markUnsold(auctionId, auctionPlayerId);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function concludeAuctionAction(auctionId: string) {
  const session = await requireRole("AUCTIONEER", "ADMIN");
  await loadScopedAuction(auctionId, scopeLeagueId(session));
  await concludeAuction(auctionId);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function removePlayerFromTeamAction(auctionId: string, auctionPlayerId: string) {
  const session = await requireRole("AUCTIONEER", "ADMIN");
  await loadScopedAuction(auctionId, scopeLeagueId(session));
  await removePlayerFromTeam(auctionId, auctionPlayerId);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function adminAssignPlayerAction(
  auctionId: string,
  auctionPlayerId: string,
  teamAuctionEntryId: string,
  price: number
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await adminAssignPlayer(auctionId, auctionPlayerId, teamAuctionEntryId, price);
  revalidatePath(`/admin/auctions/${auctionId}`);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}
