"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, allLeagueIds } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import type { FantasyPricingModel } from "@/app/generated/prisma/client";
import {
  submitFantasyTeam,
  deleteFantasyTeam,
  updateFantasyLockDate,
  updateFantasySettings,
} from "@/lib/services/fantasyTeam.service";

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

export async function updateFantasySettingsAction(
  auctionId: string,
  input: {
    pricingModel?: FantasyPricingModel;
    selfPickRequired?: boolean;
    maxTeamsPerUser?: number;
  }
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedAuction(auctionId, leagueIds);
    await updateFantasySettings(auctionId, input);
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
