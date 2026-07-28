import { listLeagues } from "@/lib/services/league.service";
import { createLeagueAction } from "@/lib/actions/league.actions";
import { DeleteLeagueButton } from "@/components/admin/DeleteLeagueButton";
import { card, cardInteractive, buttonPrimary, inputClass } from "@/lib/ui";

export async function LeaguesPanel() {
  const leagues = await listLeagues();

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Leagues</h2>

      <details className={`${card} mb-6`}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          New league
        </summary>
        <form action={createLeagueAction} className="flex flex-col gap-3 max-w-xl px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              League name
              <input name="name" required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Type
              <input name="type" required placeholder="Cricket, Soccer, Frisbee…" className={inputClass} />
            </label>
          </div>
          <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
            Create league
          </button>
        </form>
      </details>

      {leagues.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No leagues yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {leagues.map((league) => (
            <li
              key={league.id}
              className={`${cardInteractive} flex items-center justify-between gap-4 px-4 py-3`}
            >
              <span>
                {league.name}{" "}
                <span className="text-black/50 dark:text-white/50">({league.type})</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm text-black/60 dark:text-white/60">
                  {league._count.users} users &middot; {league._count.rosters} rosters &middot;{" "}
                  {league._count.tournaments} tournaments
                </span>
                <DeleteLeagueButton
                  leagueId={league.id}
                  leagueName={league.name}
                  userCount={league._count.users}
                  rosterCount={league._count.rosters}
                  tournamentCount={league._count.tournaments}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
