"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster, loadScopedTournament } from "@/lib/auth/scope";
import { createTournament, createTeam, deleteTournament } from "@/lib/services/tournament.service";

export async function createTournamentAction(formData: FormData) {
  const { session, leagueId } = await requireAdminOrLeagueAdmin();

  const rosterId = String(formData.get("rosterId") ?? "");
  await loadScopedRoster(rosterId, leagueId);

  const tournament = await createTournament({
    name: String(formData.get("name") ?? ""),
    rosterId,
    numTeams: Number(formData.get("numTeams")),
    squadSize: Number(formData.get("squadSize")),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: new Date(String(formData.get("endDate"))),
    createdById: session.user.id,
  });

  redirect(`/admin/tournaments/${tournament.id}`);
}

export async function createTeamAction(formData: FormData) {
  const { leagueId } = await requireAdminOrLeagueAdmin();

  const tournamentId = String(formData.get("tournamentId") ?? "");
  const managerId = String(formData.get("managerId") ?? "");
  await loadScopedTournament(tournamentId, leagueId);

  await createTeam({
    tournamentId,
    name: String(formData.get("name") ?? ""),
    managerId: managerId || undefined,
    managerOccupiesSlot: formData.get("managerOccupiesSlot") === "on",
  });

  redirect(`/admin/tournaments/${tournamentId}`);
}

export async function deleteTournamentAction(tournamentId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedTournament(tournamentId, leagueId);
  await deleteTournament(tournamentId);
  revalidatePath("/admin/tournaments");
  revalidatePath("/");
}
