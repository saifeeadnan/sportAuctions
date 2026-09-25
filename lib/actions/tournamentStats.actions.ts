"use server";

import { revalidatePath } from "next/cache";
import { assertInScope, requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  deleteStatsUpload,
  publishStatsUpload,
  rotateStatsLink,
  stopSharingStats,
} from "@/lib/services/tournamentStats.service";

// The league is an explicit argument checked with assertInScope on every
// action — the admin sidebar's league filter is display-only and can't be
// trusted to say which league a mutation targets.
async function adminFor(leagueId: string): Promise<string> {
  const { session, leagueIds } = await requireAdminOrLeagueAdmin();
  assertInScope(leagueIds, leagueId);
  return session.user.id;
}

const PAGE = "/admin/tournament-analysis";

export async function deleteStatsUploadAction(leagueId: string, uploadId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const actorId = await adminFor(leagueId);
    await deleteStatsUpload(leagueId, uploadId, actorId);
    revalidatePath(PAGE);
  });
}

export async function publishStatsUploadAction(
  leagueId: string,
  uploadId: string
): Promise<ActionResult<{ token: string }>> {
  return toActionResult(async () => {
    const actorId = await adminFor(leagueId);
    const result = await publishStatsUpload(leagueId, uploadId, actorId);
    revalidatePath(PAGE);
    return result;
  });
}

export async function stopSharingStatsAction(leagueId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const actorId = await adminFor(leagueId);
    await stopSharingStats(leagueId, actorId);
    revalidatePath(PAGE);
  });
}

export async function rotateStatsLinkAction(leagueId: string): Promise<ActionResult<{ token: string }>> {
  return toActionResult(async () => {
    const actorId = await adminFor(leagueId);
    const result = await rotateStatsLink(leagueId, actorId);
    revalidatePath(PAGE);
    return result;
  });
}
