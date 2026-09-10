"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireAdminOrLeagueAdmin, allLeagueIds } from "@/lib/auth/guards";
import { loadScopedRoster } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  upsertSeedingWindow,
  submitSeeds,
  finalizeSeeding,
} from "@/lib/services/playerSeeding.service";

function revalidateSeedingPaths(rosterId: string) {
  revalidatePath(`/admin/rosters/${rosterId}`);
  revalidatePath(`/admin/rosters/${rosterId}/seeding`);
  revalidatePath("/viewer/rate");
  revalidatePath(`/viewer/rate/${rosterId}`);
  revalidatePath("/manager/rate");
}

export async function upsertSeedingWindowAction(
  rosterId: string,
  input: { opensAt: string; closesAt: string; maxSeed: number }
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedRoster(rosterId, leagueIds);
    await upsertSeedingWindow(
      rosterId,
      { opensAt: new Date(input.opensAt), closesAt: new Date(input.closesAt), maxSeed: input.maxSeed },
      session.user.id
    );
    revalidateSeedingPaths(rosterId);
  });
}

export async function finalizeSeedingAction(
  rosterId: string,
  orderedPlayerIds: string[]
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedRoster(rosterId, leagueIds);
    await finalizeSeeding(rosterId, orderedPlayerIds, session.user.id);
    revalidateSeedingPaths(rosterId);
  });
}

export async function submitSeedsAction(
  rosterId: string,
  seeds: { playerId: string; seed: number }[]
): Promise<ActionResult> {
  return toActionResult(async () => {
    const session = await requireRole("VIEWER", "TEAM_MANAGER");
    await submitSeeds(rosterId, session.user.id, allLeagueIds(session), seeds);
    revalidateSeedingPaths(rosterId);
  });
}
