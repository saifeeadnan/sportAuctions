"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, allLeagueIds } from "@/lib/auth/guards";
import { loadScopedTournament, loadScopedAuction } from "@/lib/auth/scope";
import { ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  startBiddingDirect,
  resetAuctionToPreBidding,
  deleteAuction,
  updateCategoryBidIncrement,
  addPlayerToAuction,
  updateAuctionPlayerCategory,
  updateAuctionTeamSettings,
  updateOnClockDisplaySettings,
  type CreateAuctionInput,
} from "@/lib/services/auction.service";
import { submitDraft, removeDraftPick } from "@/lib/services/preAuctionDraft.service";
import type { OnClockTemplate, OnClockFieldKey } from "@/lib/onClockDisplay";

export async function createAuctionAction(
  input: Omit<CreateAuctionInput, "createdById">
): Promise<ActionResult<{ auctionId: string }>> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(input.tournamentId, leagueIds);
    const auction = await createAuction({ ...input, createdById: session.user.id });
    return { auctionId: auction.id };
  });
}

// The unused trailing params let this bind directly into useActionState
// (ActionResultForm) as `openPreAuctionAction.bind(null, auctionId)`, which
// then gets called as `(prevState, formData)`.
export async function openPreAuctionAction(
  auctionId: string,
  _prevState?: unknown,
  _formData?: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await openPreAuction(auctionId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
}

// redirect() must be called outside any try/catch (Next.js docs) — it
// throws its own control-flow error, so it can't live inside
// toActionResult's wrapped function. Run the mutation through
// toActionResult first, then redirect only once that's clean.
export async function lockPreAuctionAction(
  auctionId: string,
  force: boolean,
  _prevState?: unknown,
  _formData?: FormData
): Promise<ActionResult> {
  const result = await toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await lockPreAuction(auctionId, force, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
  if (result.error) return result;
  redirect(`/admin/auctions/${auctionId}`);
}

export async function startBiddingAction(
  auctionId: string,
  _prevState?: unknown,
  _formData?: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("ADMIN", "AUCTIONEER", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, allLeagueIds(session));
    await startBidding(auctionId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}

export async function startBiddingDirectAction(
  auctionId: string,
  _prevState?: unknown,
  _formData?: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("ADMIN", "AUCTIONEER", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, allLeagueIds(session));
    await startBiddingDirect(auctionId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}

export async function resetAuctionAction(auctionId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("ADMIN", "AUCTIONEER", "LEAGUE_ADMIN");
    await loadScopedAuction(auctionId, allLeagueIds(session));
    await resetAuctionToPreBidding(auctionId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}

export async function addPlayerToAuctionAction(
  auctionId: string,
  playerId: string,
  categoryId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await addPlayerToAuction(auctionId, playerId, categoryId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}

export async function updateAuctionPlayerCategoryAction(
  auctionId: string,
  auctionPlayerId: string,
  categoryId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateAuctionPlayerCategory(auctionId, auctionPlayerId, categoryId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}

export async function updateCategoryBidIncrementAction(
  auctionId: string,
  categoryId: string,
  bidIncrement: number | null
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateCategoryBidIncrement(categoryId, bidIncrement, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
  });
}

export async function updateAuctionTeamSettingsAction(
  auctionId: string,
  input: { newTeamBudget?: number; newSquadSize?: number }
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateAuctionTeamSettings(auctionId, input, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}

export async function updateOnClockDisplaySettingsAction(
  auctionId: string,
  input: { onClockTemplate?: OnClockTemplate; onClockVisibleFields?: OnClockFieldKey[] }
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateOnClockDisplaySettings(auctionId, input, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}`);
    revalidatePath(`/auctioneer/auctions/${auctionId}/console`);
  });
}

export async function deleteAuctionAction(auctionId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    const auction = await loadScopedAuction(auctionId, leagueIds);
    await deleteAuction(auctionId, session.user.id);
    revalidatePath(`/admin/tournaments/${auction.tournamentId}`);
  });
}

export async function submitDraftAction(
  teamAuctionEntryId: string,
  auctionPlayerIds: string[]
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

    await submitDraft(teamAuctionEntryId, auctionPlayerIds, session.user.id);
    revalidatePath(`/manager/teams/${teamAuctionEntryId}/draft`);
  });
}

export async function adminRemoveDraftPickAction(
  auctionId: string,
  teamAuctionEntryId: string,
  auctionPlayerId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await removeDraftPick(teamAuctionEntryId, auctionPlayerId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}/teams/${teamAuctionEntryId}`);
  });
}
