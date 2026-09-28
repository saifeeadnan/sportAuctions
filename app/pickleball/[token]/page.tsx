import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicPickleballEvent } from "@/lib/services/pickleballEvent.service";
import { PickleballTeamSearch } from "@/components/pickleball/PickleballTeamSearch";
import { PickleballLiveRefresh } from "@/components/pickleball/PickleballLiveRefresh";
import { formatDateTime } from "@/lib/dates";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const event = await getPublicPickleballEvent(token);
  if (!event) return {};
  return {
    title: `${event.tournamentName} — Pickleball results`,
    description: `${event.leagueName} pickleball results and standings`,
    // The token IS the access control — keep this out of search indexes
    // should one ever leak, same posture as /stats/[token].
    robots: { index: false, follow: false },
  };
}

/**
 * A league's live pickleball results and standings, reachable by anyone with
 * the link — no login. Like /stats/[token] and /roster-card/[token], the
 * unguessable token is the entire access control, so getPublicPickleballEvent
 * never checks a session.
 */
export default async function PickleballPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await getPublicPickleballEvent(token);
  if (!event) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-6">
      <PickleballLiveRefresh token={token} />
      <header className="flex items-center gap-4">
        {event.hasLeagueLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/leagues/${event.leagueId}/logo`}
            alt={`${event.leagueName} logo`}
            className="h-16 w-16 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{event.tournamentName}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {event.leagueName}
            {event.publishedAt ? ` · Published ${formatDateTime(event.publishedAt)}` : ""}
          </p>
        </div>
      </header>

      <PickleballTeamSearch standings={event.standings} matches={event.matches} />
    </div>
  );
}
