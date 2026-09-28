"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  enterGameScore,
  clearGameScore,
  resetPickleballScores,
  type EnterGameScoreInput,
} from "@/lib/services/pickleballScoring.service";

export async function enterGameScoreAction(
  tournamentId: string,
  eventId: string,
  gameId: string,
  input: EnterGameScoreInput
): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(tournamentId, leagueIds);
    await enterGameScore(tournamentId, gameId, input, session.user.id);
    revalidatePath(`/admin/pickleball/${eventId}/score`);
  });
}

export async function clearGameScoreAction(tournamentId: string, eventId: string, gameId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(tournamentId, leagueIds);
    await clearGameScore(tournamentId, gameId, session.user.id);
    revalidatePath(`/admin/pickleball/${eventId}/score`);
  });
}

/** Wipes every game's players/scores for the event, keeping the schedule
 * (teams, matches, groups, rounds) as-is — the lighter alternative to
 * deleting the whole event when only the entered results need redoing. */
export async function resetPickleballScoresAction(tournamentId: string, eventId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(tournamentId, leagueIds);
    await resetPickleballScores(tournamentId, eventId, session.user.id);
    revalidatePath(`/admin/pickleball/${eventId}`);
    revalidatePath(`/admin/pickleball/${eventId}/score`);
  });
}
