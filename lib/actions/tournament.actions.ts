"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster, loadScopedTournament, loadScopedTeam } from "@/lib/auth/scope";
import {
  createTournament,
  attachRosterToTournament,
  deleteTournament,
  deleteTeam,
  updateTournamentDates,
} from "@/lib/services/tournament.service";

export async function createTournamentAction(formData: FormData) {
  const { session, leagueId } = await requireAdminOrLeagueAdmin();

  const rosterId = String(formData.get("rosterId") ?? "");
  if (rosterId) {
    await loadScopedRoster(rosterId, leagueId);
  }
  // The session's own scoped leagueId always wins when present (a League
  // Admin can't be redirected to another league by a tampered form field);
  // a submitted leagueId is only trusted for an unscoped site ADMIN, same
  // idiom as app/api/rosters/upload/route.ts.
  const submittedLeagueId = String(formData.get("leagueId") ?? "");

  const tournament = await createTournament({
    name: String(formData.get("name") ?? ""),
    rosterId: rosterId || undefined,
    leagueId: leagueId ?? submittedLeagueId,
    numTeams: Number(formData.get("numTeams")),
    squadSize: Number(formData.get("squadSize")),
    startDate: new Date(String(formData.get("startDate"))),
    endDate: new Date(String(formData.get("endDate"))),
    createdById: session.user.id,
  });

  redirect(`/admin/tournaments/${tournament.id}`);
}

export async function attachRosterToTournamentAction(tournamentId: string, formData: FormData) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedTournament(tournamentId, leagueId);

  const rosterId = String(formData.get("rosterId") ?? "");
  await loadScopedRoster(rosterId, leagueId);

  await attachRosterToTournament(tournamentId, rosterId);
  revalidatePath(`/admin/tournaments/${tournamentId}`);
}

export async function deleteTournamentAction(tournamentId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedTournament(tournamentId, leagueId);
  await deleteTournament(tournamentId);
  revalidatePath("/admin/tournaments");
  revalidatePath("/");
}

export async function updateTournamentDatesAction(
  tournamentId: string,
  startDate: string,
  endDate: string
) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  await loadScopedTournament(tournamentId, leagueId);
  await updateTournamentDates(tournamentId, {
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  });
  revalidatePath(`/admin/tournaments/${tournamentId}`);
  revalidatePath("/admin/tournaments");
}

export async function deleteTeamAction(teamId: string) {
  const { leagueId } = await requireAdminOrLeagueAdmin();
  const team = await loadScopedTeam(teamId, leagueId);
  await deleteTeam(teamId);
  revalidatePath(`/admin/tournaments/${team.tournamentId}`);
}
