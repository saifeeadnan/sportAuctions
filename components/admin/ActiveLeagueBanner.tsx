"use client";

import { useSearchParams } from "next/navigation";
import { formatCalendarDate } from "@/lib/dates";
import { Badge } from "@/components/ui/Badge";

type League = {
  id: string;
  name: string;
  type: string;
  logo?: { id: string } | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  maxTournaments: number | null;
  maxTeamsPerTournament: number | null;
  maxSponsorsPerTournament: number | null;
};

// Mirrors lib/services/league.service.ts's isLeagueReadOnly — duplicated
// rather than imported since that file pulls in the Prisma client, which
// can't be bundled into a "use client" component.
function isReadOnly(league: League): boolean {
  return league.endDate != null && new Date(league.endDate) < new Date();
}

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
    <div className="mb-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        {league?.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/leagues/${league.id}/logo`}
            alt={`${league.name} logo`}
            className="h-10 w-10 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1"
          />
        )}
        <span className="font-medium">{league ? league.name : "All leagues"}</span>
        {league && isReadOnly(league) && <Badge variant="warning">Read-only</Badge>}
      </div>
      {league && (
        <p className="text-xs text-black/60 dark:text-white/60">
          Start: {league.startDate ? formatCalendarDate(league.startDate) : "—"} &middot; End:{" "}
          {league.endDate ? formatCalendarDate(league.endDate) : "—"} &middot; Max tournaments:{" "}
          {league.maxTournaments ?? "Unlimited"} &middot; Max teams/tournament:{" "}
          {league.maxTeamsPerTournament ?? "Unlimited"} &middot; Max sponsors/tournament:{" "}
          {league.maxSponsorsPerTournament ?? "Unlimited"}
        </p>
      )}
    </div>
  );
}
