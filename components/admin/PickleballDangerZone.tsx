"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePickleballEventAction } from "@/lib/actions/pickleballEvent.actions";
import { resetPickleballScoresAction } from "@/lib/actions/pickleballScoring.actions";
import { buttonSecondary, card } from "@/lib/ui";

/**
 * The two ways to walk back a schedule once scoring has started: reset every
 * game's players/scores but keep the schedule (teams, matches, groups,
 * rounds) — or delete the whole event. Shown whether or not scoring has
 * started; reset is the lighter option most re-do's actually want.
 */
export function PickleballDangerZone({
  tournamentId,
  eventId,
  anyGameDataEntered,
}: {
  tournamentId: string;
  eventId: string;
  anyGameDataEntered: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reset" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    if (
      !window.confirm(
        "Reset every game's players and scores for this event? The schedule (teams, matches, groups, rounds) stays — this only clears what's been entered. This can't be undone."
      )
    ) {
      return;
    }
    setBusy("reset");
    setError(null);
    const result = await resetPickleballScoresAction(tournamentId, eventId);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this pickleball event? The schedule, every match, and every entered score are gone for good, and the public link stops working. This can't be undone."
      )
    ) {
      return;
    }
    setBusy("delete");
    setError(null);
    const result = await deletePickleballEventAction(tournamentId, eventId);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/pickleball");
  }

  return (
    <section className={`${card} px-4 py-3 flex flex-col gap-2`}>
      <h2 className="text-sm font-medium">Danger zone</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy !== null || !anyGameDataEntered} onClick={handleReset} className={`${buttonSecondary} px-2 py-1 text-xs`}>
          {busy === "reset" ? "Resetting…" : "Reset all scores"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={handleDelete}
          className="text-xs text-red-600 dark:text-red-400 underline underline-offset-2 disabled:opacity-50"
        >
          {busy === "delete" ? "Deleting…" : "Delete event"}
        </button>
      </div>
      {!anyGameDataEntered && (
        <p className="text-xs text-black/40 dark:text-white/40">Nothing entered yet — reset has nothing to clear.</p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
