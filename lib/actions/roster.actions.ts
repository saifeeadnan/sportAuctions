"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster } from "@/lib/auth/scope";
import {
  deleteRoster,
  renameRoster,
  createPlayer,
  updatePlayer,
  deletePlayer,
  type PlayerInput,
} from "@/lib/services/roster.service";

export async function deleteRosterAction(rosterId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedRoster(rosterId, leagueId);
  await deleteRoster(rosterId);
  revalidatePath("/admin/rosters");
  revalidatePath("/");
}

export async function renameRosterAction(rosterId: string, name: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedRoster(rosterId, leagueId);
  await renameRoster(rosterId, name);
  revalidatePath(`/admin/rosters/${rosterId}`);
  revalidatePath("/admin/rosters");
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

export async function createPlayerAction(rosterId: string, formData: FormData) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedRoster(rosterId, leagueId);
  await createPlayer(rosterId, parsePlayerInput(formData));
  revalidatePath(`/admin/rosters/${rosterId}`);
}

export async function updatePlayerAction(
  rosterId: string,
  playerId: string,
  formData: FormData
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedRoster(rosterId, leagueId);
  await updatePlayer(playerId, parsePlayerInput(formData));
  revalidatePath(`/admin/rosters/${rosterId}`);
  redirect(`/admin/rosters/${rosterId}`);
}

export async function deletePlayerAction(rosterId: string, playerId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedRoster(rosterId, leagueId);
  await deletePlayer(playerId);
  revalidatePath(`/admin/rosters/${rosterId}`);
}
