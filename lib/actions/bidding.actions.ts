"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import {
  selectNextPlayer,
  recordSale,
  markUnsold,
  concludeAuction,
} from "@/lib/services/bidding.service";

export async function selectNextPlayerAction(auctionId: string, auctionPlayerId: string) {
  await requireRole("AUCTIONEER", "ADMIN");
  await selectNextPlayer(auctionId, auctionPlayerId);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function recordSaleAction(
  auctionId: string,
  auctionPlayerId: string,
  winningTeamAuctionEntryId: string,
  price: number
) {
  await requireRole("AUCTIONEER", "ADMIN");
  await recordSale(auctionId, auctionPlayerId, winningTeamAuctionEntryId, price);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function markUnsoldAction(auctionId: string, auctionPlayerId: string) {
  await requireRole("AUCTIONEER", "ADMIN");
  await markUnsold(auctionId, auctionPlayerId);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function concludeAuctionAction(auctionId: string) {
  await requireRole("AUCTIONEER", "ADMIN");
  await concludeAuction(auctionId);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  revalidatePath(`/admin/auctions/${auctionId}`);
}
