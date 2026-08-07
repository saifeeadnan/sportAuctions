"use client";

import { useSearchParams } from "next/navigation";

type League = { id: string; name: string; type: string; logo?: { id: string } | null };

export function ActiveLeagueBanner({
  leagues,
  fixedLeague,
}: {
  /** Site-ADMIN case: resolve which league is active from the sidebar's
   * `?league=` selection. Omit when passing `fixedLeague` instead. */
  leagues?: League[];
  /** LEAGUE_ADMIN case: their own league is fixed for the whole session, not
   * a URL selection, so it's passed straight through with no search-param
   * lookup at all. */
  fixedLeague?: League | null;
}) {
  const searchParams = useSearchParams();
  const selectedLeagueId = searchParams.get("league");
  const league =
    fixedLeague ?? (leagues && selectedLeagueId ? leagues.find((l) => l.id === selectedLeagueId) : null);

  return (
    <div className="mb-4 flex items-center gap-2 text-sm">
      {league?.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/leagues/${league.id}/logo`}
          alt={`${league.name} logo`}
          className="h-10 w-10 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1"
        />
      )}
      <span className="font-medium">{league ? league.name : "All leagues"}</span>
    </div>
  );
}
