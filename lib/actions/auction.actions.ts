"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, scopeLeagueId } from "@/lib/auth/guards";
import { loadScopedTournament, loadScopedAuction } from "@/lib/auth/scope";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  resetAuctionToPreBidding,
  deleteAuction,
  updateCategoryBidIncrement,
  addPlayerToAuction,
  updateAuctionPlayerCategory,
  type CreateAuctionInput,
} from "@/lib/services/auction.service";
import { submitDraft, removeDraftPick } from "@/lib/services/preAuctionDraft.service";

export async function createAuctionAction(
  input: Omit<CreateAuctionInput, "createdById">
): Promise<{ auctionId: string }> {
  const { session, leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedTournament(input.tournamentId, leagueId);
  const auction = await createAuction({ ...input, createdById: session.user.id });
  return { auctionId: auction.id };
}

export async function openPreAuctionAction(auctionId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await openPreAuction(auctionId);
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function lockPreAuctionAction(auctionId: string, force: boolean) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await lockPreAuction(auctionId, force);
  revalidatePath(`/admin/auctions/${auctionId}`);
  redirect(`/admin/auctions/${auctionId}`);
}

export async function startBiddingAction(auctionId: string) {
  const session = await requireRole("ADMIN", "AUCTIONEER", "LEAGUE_ADMIN");
  await loadScopedAuction(auctionId, scopeLeagueId(session));
  await startBidding(auctionId);
  revalidatePath(`/admin/auctions/${auctionId}`);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function resetAuctionAction(auctionId: string) {
  const session = await requireRole("ADMIN", "AUCTIONEER", "LEAGUE_ADMIN");
  await loadScopedAuction(auctionId, scopeLeagueId(session));
  await resetAuctionToPreBidding(auctionId);
  revalidatePath(`/admin/auctions/${auctionId}`);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function addPlayerToAuctionAction(
  auctionId: string,
  playerId: string,
  categoryId: string
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await addPlayerToAuction(auctionId, playerId, categoryId);
  revalidatePath(`/admin/auctions/${auctionId}`);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function updateAuctionPlayerCategoryAction(
  auctionId: string,
  auctionPlayerId: string,
  categoryId: string
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await updateAuctionPlayerCategory(auctionId, auctionPlayerId, categoryId);
  revalidatePath(`/admin/auctions/${auctionId}`);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function updateCategoryBidIncrementAction(
  auctionId: string,
  categoryId: string,
  bidIncrement: number | null
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await updateCategoryBidIncrement(categoryId, bidIncrement);
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function deleteAuctionAction(auctionId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  const auction = await loadScopedAuction(auctionId, leagueId);
  await deleteAuction(auctionId);
  revalidatePath(`/admin/tournaments/${auction.tournamentId}`);
}

export async function submitDraftAction(
  teamAuctionEntryId: string,
  auctionPlayerIds: string[]
) {
  const session = await requireRole("TEAM_MANAGER");

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: { team: true },
  });
  if (!entry || entry.team.managerId !== session.user.id) {
    throw new ValidationError("You do not manage this team");
  }

  await submitDraft(teamAuctionEntryId, auctionPlayerIds);
  revalidatePath(`/manager/teams/${teamAuctionEntryId}/draft`);
}

export async function adminRemoveDraftPickAction(
  auctionId: string,
  teamAuctionEntryId: string,
  auctionPlayerId: string
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedAuction(auctionId, leagueId);
  await removeDraftPick(teamAuctionEntryId, auctionPlayerId);
  revalidatePath(`/admin/auctions/${auctionId}/teams/${teamAuctionEntryId}`);
}
