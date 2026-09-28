"use client";

import { useMemo, useState } from "react";
import { PickleballStandings } from "@/components/pickleball/PickleballStandings";
import { PickleballResults } from "@/components/pickleball/PickleballResults";
import type { PickleballMatchView, PickleballStandingsRowView } from "@/lib/services/pickleballEvent.service";
import { inputClass } from "@/lib/ui";

/**
 * Standings always shows every team — a search narrows only the results
 * below it, so a spectator (or the admin, previewing exactly what the
 * public page shows) can jump straight to one team's matches without losing
 * the full standings table for context. Client-only for the search input's
 * own state; the two table components underneath stay the same plain,
 * server-renderable pieces either way.
 */
export function PickleballTeamSearch({
  standings,
  matches,
}: {
  standings: PickleballStandingsRowView[];
  matches: PickleballMatchView[];
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const filteredMatches = useMemo(
    () =>
      query === ""
        ? matches
        : matches.filter((m) => m.team1Name.toLowerCase().includes(query) || m.team2Name.toLowerCase().includes(query)),
    [matches, query]
  );
  const noMatches = query !== "" && filteredMatches.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PickleballStandings standings={standings} matches={matches} />

      <label className="flex flex-col gap-1 text-sm max-w-xs">
        Search a team
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Team name…"
          autoComplete="off"
          className={inputClass}
        />
      </label>

      {noMatches ? (
        <p className="text-sm text-black/60 dark:text-white/60">No team matches &quot;{search.trim()}&quot;.</p>
      ) : (
        <PickleballResults matches={filteredMatches} />
      )}
    </div>
  );
}
