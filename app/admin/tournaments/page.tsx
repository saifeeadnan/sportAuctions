import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function TournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    include: { roster: true, _count: { select: { teams: true, auctions: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Tournaments</h1>
        <Link
          href="/admin/tournaments/new"
          className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
        >
          New tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No tournaments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link
                href={`/admin/tournaments/${t.id}`}
                className="flex items-center justify-between rounded border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>
                  {t.name}{" "}
                  <span className="text-black/50 dark:text-white/50">
                    ({t.roster.name})
                  </span>
                </span>
                <span className="text-sm text-black/60 dark:text-white/60">
                  {t._count.teams}/{t.numTeams} teams &middot; {t._count.auctions} auctions
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
