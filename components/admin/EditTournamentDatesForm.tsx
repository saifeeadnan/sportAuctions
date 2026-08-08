"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTournamentDatesAction } from "@/lib/actions/tournament.actions";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

export function EditTournamentDatesForm({
  tournamentId,
  startDate,
  endDate,
}: {
  tournamentId: string;
  /** Already-formatted "YYYY-MM-DD" strings (computed server-side via
   * `lib/dates.ts`'s `toDateInputValue`) — passing a `Date` across the
   * Server-to-Client-Component boundary doesn't reliably survive as a real
   * `Date` instance, so the caller formats it first. */
  startDate: string;
  endDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        Edit dates
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await updateTournamentDatesAction(tournamentId, start, end);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-xs">
          Start
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={`${inputClass} py-1 text-xs`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          End
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={`${inputClass} py-1 text-xs`}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={handleSave}
          className={`${buttonPrimary} px-2 py-1 text-xs`}
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
