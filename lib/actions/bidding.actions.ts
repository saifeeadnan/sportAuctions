"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  selectNextPlayer,
  recordSale,
  markUnsold,
  concludeAuction,
  adminAssignPlayer,
  removePlayerFromTeam,
  placeBid,
} from "@/lib/services/bidding.service";

export async function selectNextPlayerAction(
  auctionId: string,
  auctionPlayerId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("AUCTIONEER", "ADMIN", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, scopeLeagueId(session));
    await selectNextPlayer(auctionId, auctionPlayerId);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
}

export async function recordSaleAction(
  auctionId: string,
  auctionPlayerId: string,
  winningTeamAuctionEntryId: string,
  price: number,
  force?: boolean
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("AUCTIONEER", "ADMIN", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, scopeLeagueId(session));
    await recordSale(auctionId, auctionPlayerId, winningTeamAuctionEntryId, price, { force });
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
}

export async function markUnsoldAction(auctionId: string, auctionPlayerId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("AUCTIONEER", "ADMIN", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, scopeLeagueId(session));
    await markUnsold(auctionId, auctionPlayerId);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
}

export async function concludeAuctionAction(auctionId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("AUCTIONEER", "ADMIN", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, scopeLeagueId(session));
    await concludeAuction(auctionId);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
}

export async function removePlayerFromTeamAction(
  auctionId: string,
  auctionPlayerId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("AUCTIONEER", "ADMIN", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, scopeLeagueId(session));
    await removePlayerFromTeam(auctionId, auctionPlayerId);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
}

export async function placeBidAction(
  auctionId: string,
  auctionPlayerId: string,
  teamAuctionEntryId: string,
  amount: number
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("TEAM_MANAGER");

    const entry = await prisma.teamAuctionEntry.findUnique({
      where: { id: teamAuctionEntryId },
      include: { team: true },
    });
    if (!entry || entry.team.managerId !== session.user.id) {
      throw new ValidationError("You do not manage this team");
    }

    // No revalidatePath needed — the "bid:placed" socket event updates every
    // connected client (including the bidder's own screen) the same way every
    // other live-bidding mutation in this console already works.
    await placeBid(auctionId, auctionPlayerId, teamAuctionEntryId, amount);
  });
}

/** Lets the auctioneer/admin place a live bid on a team's behalf — for a
 * manager who isn't able to log in and bid themselves. Goes through the
 * exact same placeBid rules (can't out-bid your own standing bid, cooldown,
 * increment, budget/slot reserve) as a manager's own bid; only the
 * authorization differs. */
export async function adminPlaceBidAction(
  auctionId: string,
  auctionPlayerId: string,
  teamAuctionEntryId: string,
  amount: number
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("AUCTIONEER", "ADMIN", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, scopeLeagueId(session));
    await placeBid(auctionId, auctionPlayerId, teamAuctionEntryId, amount);
  });
}

export async function adminAssignPlayerAction(
  auctionId: string,
  auctionPlayerId: string,
  teamAuctionEntryId: string,
  price: number
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueId } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueId);
    await adminAssignPlayer(auctionId, auctionPlayerId, teamAuctionEntryId, price);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}
