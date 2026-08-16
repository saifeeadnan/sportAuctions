"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedRoster, loadScopedTournament, loadScopedTeam } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  createTournament,
  attachRosterToTournament,
  deleteTournament,
  deleteTeam,
  updateTournamentDates,
} from "@/lib/services/tournament.service";

// redirect() must be called outside any try/catch (Next.js docs), so the
// mutation runs through toActionResult first and only redirects once that's
// clean. The unused prevState param lets this bind into useActionState
// (ActionResultForm) directly as a plain <form action={createTournamentAction}>.
export async function createTournamentAction(
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  const result = await toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();

    const rosterId = String(formData.get("rosterId") ?? "");
    if (rosterId) {
      await loadScopedRoster(rosterId, leagueIds);
    }
    // The session's own scoped leagueId always wins when it's unambiguous (a
    // single-league League Admin can't be redirected to another league by a
    // tampered form field); a submitted leagueId is trusted for an unscoped
    // site ADMIN or a multi-league League Admin, same idiom as
    // app/api/rosters/upload/route.ts.
    const submittedLeagueId = String(formData.get("leagueId") ?? "");

    return createTournament({
      name: String(formData.get("name") ?? ""),
      rosterId: rosterId || undefined,
      leagueId: leagueIds?.length === 1 ? leagueIds[0] : submittedLeagueId,
      numTeams: Number(formData.get("numTeams")),
      squadSize: Number(formData.get("squadSize")),
      startDate: new Date(String(formData.get("startDate"))),
      endDate: new Date(String(formData.get("endDate"))),
      createdById: session.user.id,
    });
  });
  if (result.error) return result;
  // TS can't statically rule out an empty-string `error` on the other
  // branch from a plain truthiness check, so `.data` reads as possibly
  // undefined here even though the check above guarantees it.
  redirect(`/admin/tournaments/${result.data!.id}`);
}

export async function attachRosterToTournamentAction(
  tournamentId: string,
  _prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(tournamentId, leagueIds);

    const rosterId = String(formData.get("rosterId") ?? "");
    await loadScopedRoster(rosterId, leagueIds);

    await attachRosterToTournament(tournamentId, rosterId);
    revalidatePath(`/admin/tournaments/${tournamentId}`);
  });
}

export async function deleteTournamentAction(tournamentId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(tournamentId, leagueIds);
    await deleteTournament(tournamentId);
    revalidatePath("/admin/tournaments");
    revalidatePath("/");
  });
}

export async function updateTournamentDatesAction(
  tournamentId: string,
  startDate: string,
  endDate: string
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(tournamentId, leagueIds);
    await updateTournamentDates(tournamentId, {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });
    revalidatePath(`/admin/tournaments/${tournamentId}`);
    revalidatePath("/admin/tournaments");
  });
}

export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { leagueIds } = await requireAdminOrLeagueAdmin();
    const team = await loadScopedTeam(teamId, leagueIds);
    await deleteTeam(teamId);
    revalidatePath(`/admin/tournaments/${team.tournamentId}`);
  });
}
