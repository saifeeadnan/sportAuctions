"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, allLeagueIds } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { fromZonedDateTimeInputValue, DEADLINE_TIME_ZONE } from "@/lib/dates";
import type { FantasyPricingModel } from "@/app/generated/prisma/client";
import {
  submitFantasyTeam,
  deleteFantasyTeam,
  updateFantasyLockDate,
  updateFantasySettings,
} from "@/lib/services/fantasyTeam.service";
import { deletePointsUpload } from "@/lib/services/fantasyPointsUpload.service";

export async function submitFantasyTeamAction(
  auctionId: string,
  auctionPlayerIds: string[],
  name?: string,
  fantasyTeamId?: string
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    const team = await submitFantasyTeam(
      auctionId,
      session.user.id,
      auctionPlayerIds,
      allLeagueIds(session),
      name,
      fantasyTeamId
    );
    revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
    return { id: team.id };
  });
}

/** Viewer self-service delete of one of their own fantasy teams — distinct
 * from adminDeleteFantasyTeamAction below, which any admin/league admin can
 * use on anyone's team. */
export async function deleteMyFantasyTeamAction(
  auctionId: string,
  fantasyTeamId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    await deleteFantasyTeam(fantasyTeamId, session.user.id);
    revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
  });
}

export async function updateFantasyLockDateAction(
  auctionId: string,
  /** A "YYYY-MM-DDTHH:mm" string from the datetime-local input, meant as
   * Eastern wall-clock time (see components/admin/EditFantasyLockDateForm.tsx)
   * — converted here to the real UTC instant it represents. */
  fantasyLockDate: string | null
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateFantasyLockDate(
      auctionId,
      fantasyLockDate ? fromZonedDateTimeInputValue(fantasyLockDate, DEADLINE_TIME_ZONE) : null,
      session.user.id
    );
    revalidatePath(`/admin/auctions/${auctionId}/fantasy-teams`);
    revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
  });
}

export async function updateFantasySettingsAction(
  auctionId: string,
  input: {
    pricingModel?: FantasyPricingModel;
    selfPickRequired?: boolean;
    maxTeamsPerUser?: number;
    managersAllowed?: boolean;
  }
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateFantasySettings(auctionId, input, session.user.id);
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

/** Admin/League-Admin: remove one points upload; player points revert to
 * whichever upload is newest afterwards (see deletePointsUpload). */
export async function adminDeletePointsUploadAction(
  auctionId: string,
  uploadId: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await deletePointsUpload(auctionId, uploadId, session.user.id);
    revalidatePath(`/admin/auctions/${auctionId}/fantasy-teams`);
    revalidatePath(`/viewer/auctions/${auctionId}/fantasy`);
  });
}
