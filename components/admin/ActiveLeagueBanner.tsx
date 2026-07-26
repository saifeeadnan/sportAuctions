"use client";

import { useSearchParams } from "next/navigation";

type League = { id: string; name: string; type: string };

export function ActiveLeagueBanner({ leagues }: { leagues: League[] }) {
  const searchParams = useSearchParams();
  const selectedLeagueId = searchParams.get("league");
  const league = selectedLeagueId ? leagues.find((l) => l.id === selectedLeagueId) : null;

  return (
    <div className="mb-4 flex items-center gap-2 text-sm">
      <span className="text-black/50 dark:text-white/50">Viewing:</span>
      <span className="font-medium">
        {league ? `${league.name} (${league.type})` : "All leagues"}
      </span>
    </div>
  );
}
