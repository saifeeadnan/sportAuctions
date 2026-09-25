import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicTournamentStats } from "@/lib/services/tournamentStats.service";
import { SheetTabs } from "@/components/stats/SheetTabs";
import { formatDateTime } from "@/lib/dates";

// Memoized per request so generateMetadata and the page share one query.
const loadStats = cache(getPublicTournamentStats);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const stats = await loadStats(token);
  if (!stats) notFound();

  const title = `${stats.leagueName} — tournament statistics`;
  const description = stats.label ?? `${stats.sheets.length} sheet${stats.sheets.length === 1 ? "" : "s"} of tournament statistics`;
  return {
    title,
    description,
    // Chat-app link previews are the point of a share link.
    openGraph: { title, description },
    // The token IS the access control — keep these URLs out of search
    // indexes should one ever leak.
    robots: { index: false, follow: false },
  };
}

/**
 * A league's published tournament statistics, reachable by anyone with the
 * link — no login. Like the roster-card and highlights pages, the
 * unguessable token is the entire access control, so getPublicTournamentStats
 * never checks a session. Read-only: it renders the sheets exactly as the
 * admin uploaded them, one tab per sheet.
 */
export default async function TournamentStatsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const stats = await loadStats(token);
  if (!stats) notFound();

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-8 flex flex-col gap-6">
      <header className="flex items-center gap-4">
        {stats.hasLeagueLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/leagues/${stats.leagueId}/logo`}
            alt={`${stats.leagueName} logo`}
            className="h-16 w-16 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{stats.leagueName}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Tournament statistics
            {stats.label ? ` · ${stats.label}` : ""}
            {stats.publishedAt ? ` · Updated ${formatDateTime(stats.publishedAt)}` : ""}
          </p>
        </div>
      </header>

      <SheetTabs sheets={stats.sheets} />
    </div>
  );
}
