"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  deleteRoster,
  renameRoster,
  createPlayer,
  updatePlayer,
  deletePlayer,
  type PlayerInput,
} from "@/lib/services/roster.service";

export async function deleteRosterAction(rosterId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedRoster(rosterId, leagueIds);
    await deleteRoster(rosterId);
    revalidatePath("/admin/rosters");
    revalidatePath("/");
  });
}

export async function renameRosterAction(rosterId: string, name: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedRoster(rosterId, leagueIds);
    await renameRoster(rosterId, name);
    revalidatePath(`/admin/rosters/${rosterId}`);
    revalidatePath("/admin/rosters");
  });
}

function parsePlayerInput(formData: FormData): PlayerInput {
  const str = (key: string) => {
    const value = formData.get(key);
    const trimmed = value ? String(value).trim() : "";
    return trimmed || undefined;
  };
  const num = (key: string) => {
    const value = formData.get(key);
    const trimmed = value ? String(value).trim() : "";
    return trimmed ? Number(trimmed) : undefined;
  };

  return {
    name: String(formData.get("name") ?? "").trim(),
    position: str("position"),
    age: num("age"),
    loginId: str("loginId"),
    defaultCategory: str("defaultCategory"),
    previousTeam: str("previousTeam"),
    photoUrl: str("photoUrl"),
    rating: num("rating"),
    battingRating: num("battingRating"),
    bowlingRating: num("bowlingRating"),
    fieldingRating: num("fieldingRating"),
  };
}

// The unused prevState param lets this bind directly into useActionState
// (ActionResultForm) as `createPlayerAction.bind(null, rosterId)`, which
// then gets called as `(prevState, formData)`.
export async function createPlayerAction(
  rosterId: string,
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedRoster(rosterId, leagueIds);
    await createPlayer(rosterId, parsePlayerInput(formData));
    revalidatePath(`/admin/rosters/${rosterId}`);
  });
}

export async function updatePlayerAction(
  rosterId: string,
  playerId: string,
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  const result = await toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedRoster(rosterId, leagueIds);
    await updatePlayer(playerId, parsePlayerInput(formData));
    revalidatePath(`/admin/rosters/${rosterId}`);
  });
  if (result.error) return result;
  redirect(`/admin/rosters/${rosterId}`);
}

export async function deletePlayerAction(rosterId: string, playerId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedRoster(rosterId, leagueIds);
    await deletePlayer(playerId);
    revalidatePath(`/admin/rosters/${rosterId}`);
  });
}
