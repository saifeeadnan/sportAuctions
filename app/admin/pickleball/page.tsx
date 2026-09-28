import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/scope";
import { isPickleballLeague } from "@/lib/leagueSport";
import { CreatePickleballEventForm } from "@/components/admin/CreatePickleballEventForm";
import { card, cardInteractive } from "@/lib/ui";

export default async function PickleballPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: selectedLeagueId } = await searchParams;
  const { leagueIds } = await resolveAdminScope(selectedLeagueId);

  const allTournaments = await prisma.tournament.findMany({
    where: leagueIds ? { leagueId: { in: leagueIds } } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      league: { select: { name: true, type: true } },
      pickleballEvent: { select: { id: true } },
      auctions: { where: { status: "COMPLETED" }, select: { id: true, name: true }, orderBy: { completedAt: "desc" } },
    },
  });
  // Only leagues whose sport is actually Pickleball belong on this page —
  // League.type is free text (see lib/leagueSport.ts), so this is a
  // case-insensitive match, not a DB-level filter.
  const tournaments = allTournaments.filter((t) => isPickleballLeague(t.league.type));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Pickleball</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Upload a match schedule, enter live scores during the tournament, and share a public results/standings
          link and OBS view.
        </p>
      </div>

      {tournaments.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No tournaments in a league whose sport is Pickleball. Set a league&apos;s Type to &quot;Pickleball&quot; to
          see its tournaments here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tournaments.map((t) => (
            <li key={t.id} className={`${card} px-4 py-3 flex items-center justify-between gap-4`}>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-xs text-black/50 dark:text-white/50">{t.league.name}</p>
              </div>
              {t.pickleballEvent ? (
                <Link href={`/admin/pickleball/${t.pickleballEvent.id}`} className={`${cardInteractive} shrink-0 px-3 py-1.5 text-sm`}>
                  Open →
                </Link>
              ) : (
                <div className="shrink-0">
                  <CreatePickleballEventForm tournamentId={t.id} completedAuctions={t.auctions} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
