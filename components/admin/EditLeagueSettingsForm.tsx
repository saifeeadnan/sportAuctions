"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeagueSettingsAction } from "@/lib/actions/league.actions";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

export function EditLeagueSettingsForm({
  leagueId,
  startDate,
  endDate,
  maxTournaments,
  maxTeamsPerTournament,
  maxSponsorsPerTournament,
}: {
  leagueId: string;
  /** Already-formatted "YYYY-MM-DD" (via `lib/dates.ts`'s `toDateInputValue`)
   * or null — passing a raw `Date` across the Server-to-Client-Component
   * boundary doesn't reliably survive as a real `Date` instance, so the
   * caller formats it first, same convention as EditTournamentDatesForm. */
  startDate: string | null;
  endDate: string | null;
  maxTournaments: number | null;
  maxTeamsPerTournament: number | null;
  maxSponsorsPerTournament: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startDate ?? "");
  const [end, setEnd] = useState(endDate ?? "");
  const [tournaments, setTournaments] = useState(maxTournaments != null ? String(maxTournaments) : "");
  const [teams, setTeams] = useState(maxTeamsPerTournament != null ? String(maxTeamsPerTournament) : "");
  const [sponsors, setSponsors] = useState(
    maxSponsorsPerTournament != null ? String(maxSponsorsPerTournament) : ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStart(startDate ?? "");
    setEnd(endDate ?? "");
    setTournaments(maxTournaments != null ? String(maxTournaments) : "");
    setTeams(maxTeamsPerTournament != null ? String(maxTeamsPerTournament) : "");
    setSponsors(maxSponsorsPerTournament != null ? String(maxSponsorsPerTournament) : "");
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-fit text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition-colors"
      >
        Settings
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await updateLeagueSettingsAction(leagueId, {
      startDate: start ? new Date(start) : null,
      endDate: end ? new Date(end) : null,
      maxTournaments: tournaments.trim() ? Number(tournaments) : null,
      maxTeamsPerTournament: teams.trim() ? Number(teams) : null,
      maxSponsorsPerTournament: sponsors.trim() ? Number(sponsors) : null,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 mt-2 mb-1 max-w-sm">
      <p className="text-xs text-black/60 dark:text-white/60">
        Blank a field to clear it back to unlimited/unset. Past the end date, this league
        becomes read-only — no new tournaments, teams, sponsors, auctions, rosters, players, or
        users can be created, though everything existing stays viewable.
      </p>
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
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-xs">
          Max tournaments
          <input
            type="number"
            min={1}
            step="1"
            placeholder="Unlimited"
            value={tournaments}
            onChange={(e) => setTournaments(e.target.value)}
            className={`${inputClass} py-1 text-xs w-24`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          Max teams/tournament
          <input
            type="number"
            min={1}
            step="1"
            placeholder="Unlimited"
            value={teams}
            onChange={(e) => setTeams(e.target.value)}
            className={`${inputClass} py-1 text-xs w-24`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          Max sponsors/tournament
          <input
            type="number"
            min={1}
            step="1"
            placeholder="Unlimited"
            value={sponsors}
            onChange={(e) => setSponsors(e.target.value)}
            className={`${inputClass} py-1 text-xs w-24`}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
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
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
