import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteTournamentButton } from "@/components/admin/DeleteTournamentButton";
import { createTournamentAction } from "@/lib/actions/tournament.actions";
import { card, cardInteractive, buttonPrimary, inputClass } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export async function TournamentsPanel() {
  const [tournaments, rosters] = await Promise.all([
    prisma.tournament.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        roster: true,
        _count: { select: { teams: true, auctions: true } },
        auctions: { select: { status: true } },
      },
    }),
    prisma.playerRoster.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Tournaments</h2>

      <details className={`${card} mb-6`}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          New tournament
        </summary>
        {rosters.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60 px-4 pb-4">
            Upload a player roster first before creating a tournament.
          </p>
        ) : (
          <form
            action={createTournamentAction}
            className="flex flex-col gap-3 max-w-xl px-4 pb-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Tournament name
                <input name="name" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Player roster
                <select name="rosterId" required className={inputClass}>
                  {rosters.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Number of teams
                <input name="numTeams" type="number" min={2} required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Players per team (squad size)
                <input name="squadSize" type="number" min={1} required className={inputClass} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Start date
                <input name="startDate" type="date" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                End date
                <input name="endDate" type="date" required className={inputClass} />
              </label>
            </div>
            <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
              Create tournament
            </button>
          </form>
        )}
      </details>

      {tournaments.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No tournaments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tournaments.map((t) => {
            const isLive = t.auctions.some((a) => a.status === "BIDDING");
            return (
              <li
                key={t.id}
                className={`${cardInteractive} flex items-center justify-between gap-4 px-4 py-3`}
              >
                <Link
                  href={`/admin/tournaments/${t.id}`}
                  className="flex-1 flex items-center gap-3 hover:underline"
                >
                  <span className="flex-1 flex items-center justify-between">
                    <span>
                      {t.name}{" "}
                      <span className="text-black/50 dark:text-white/50">({t.roster.name})</span>
                    </span>
                    <span className="text-sm text-black/60 dark:text-white/60 mr-4">
                      {t._count.teams}/{t.numTeams} teams &middot; {t._count.auctions} auctions
                    </span>
                  </span>
                  {isLive && <Badge variant="info">Live</Badge>}
                </Link>
                <DeleteTournamentButton
                  tournamentId={t.id}
                  tournamentName={t.name}
                  teamCount={t._count.teams}
                  auctionCount={t._count.auctions}
                  hasLiveAuction={isLive}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
