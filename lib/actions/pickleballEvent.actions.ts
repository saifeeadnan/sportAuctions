"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrLeagueAdmin } from "@/lib/auth/guards";
import { loadScopedTournament, loadScopedPickleballEvent } from "@/lib/auth/scope";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import {
  createPickleballEvent,
  deletePickleballEvent,
  publishPickleballEvent,
  stopSharingPickleball,
  rotatePickleballLink,
} from "@/lib/services/pickleballEvent.service";

// A pickleball event is scoped by its tournament (not directly by league), so
// every action resolves the tournament — or the event, which already carries
// its tournament — through lib/auth/scope.ts and checks assertInScope from
// there, same posture as tournament.actions.ts's loadScopedTournament calls.

const PAGE = "/admin/pickleball";

export async function createPickleballEventAction(
  tournamentId: string,
  auctionId: string
): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedTournament(tournamentId, leagueIds);
    const result = await createPickleballEvent(tournamentId, auctionId, session.user.id);
    revalidatePath(PAGE);
    revalidatePath(`${PAGE}/${result.id}`);
    return result;
  });
}

export async function publishPickleballEventAction(
  tournamentId: string,
  eventId: string
): Promise<ActionResult<{ token: string }>> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedPickleballEvent(eventId, leagueIds);
    const result = await publishPickleballEvent(tournamentId, eventId, session.user.id);
    revalidatePath(`${PAGE}/${eventId}`);
    return result;
  });
}

export async function stopSharingPickleballAction(tournamentId: string, eventId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedPickleballEvent(eventId, leagueIds);
    await stopSharingPickleball(tournamentId, eventId, session.user.id);
    revalidatePath(`${PAGE}/${eventId}`);
  });
}

export async function rotatePickleballLinkAction(
  tournamentId: string,
  eventId: string
): Promise<ActionResult<{ token: string }>> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedPickleballEvent(eventId, leagueIds);
    const result = await rotatePickleballLink(tournamentId, eventId, session.user.id);
    revalidatePath(`${PAGE}/${eventId}`);
    return result;
  });
}

/** Deletes the whole event — schedule, matches, every game's players/scores,
 * and the public link. Works whether or not scoring has started; the caller
 * navigates away afterward, since this page no longer exists to refresh. */
export async function deletePickleballEventAction(tournamentId: string, eventId: string): Promise<ActionResult> {
  return toActionResult(async () => {
    const { session, leagueIds } = await requireAdminOrLeagueAdmin();
    await loadScopedPickleballEvent(eventId, leagueIds);
    await deletePickleballEvent(tournamentId, eventId, session.user.id);
    revalidatePath(PAGE);
  });
}
