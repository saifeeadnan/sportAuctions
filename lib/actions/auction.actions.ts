"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  deleteAuction,
  type CreateAuctionInput,
} from "@/lib/services/auction.service";
import { submitDraft } from "@/lib/services/preAuctionDraft.service";

export async function createAuctionAction(
  input: Omit<CreateAuctionInput, "createdById">
): Promise<{ auctionId: string }> {
  const session = await requireRole("ADMIN");
  const auction = await createAuction({ ...input, createdById: session.user.id });
  return { auctionId: auction.id };
}

export async function openPreAuctionAction(auctionId: string) {
  await requireRole("ADMIN");
  await openPreAuction(auctionId);
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function lockPreAuctionAction(auctionId: string, force: boolean) {
  await requireRole("ADMIN");
  await lockPreAuction(auctionId, force);
  revalidatePath(`/admin/auctions/${auctionId}`);
}

export async function startBiddingAction(auctionId: string) {
  await requireRole("ADMIN", "AUCTIONEER");
  await startBidding(auctionId);
  revalidatePath(`/admin/auctions/${auctionId}`);
  revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
}

export async function deleteAuctionAction(auctionId: string) {
  await requireRole("ADMIN");
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { tournamentId: true },
  });
  await deleteAuction(auctionId);
  if (auction) revalidatePath(`/admin/tournaments/${auction.tournamentId}`);
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
