import { prisma } from "@/lib/prisma";
import { createTournamentAction } from "@/lib/actions/tournament.actions";

export default async function NewTournamentPage() {
  const rosters = await prisma.playerRoster.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">New tournament</h1>

      {rosters.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          Upload a player roster first before creating a tournament.
        </p>
      ) : (
        <form action={createTournamentAction} className="flex flex-col gap-3 max-w-sm">
          <label className="flex flex-col gap-1 text-sm">
            Tournament name
            <input
              name="name"
              required
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Player roster
            <select
              name="rosterId"
              required
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            >
              {rosters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Number of teams
            <input
              name="numTeams"
              type="number"
              min={2}
              required
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Players per team (squad size)
            <input
              name="squadSize"
              type="number"
              min={1}
              required
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Start date
            <input
              name="startDate"
              type="date"
              required
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            End date
            <input
              name="endDate"
              type="date"
              required
              className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
            />
          </label>
          <button
            type="submit"
            className="mt-2 self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            Create tournament
          </button>
        </form>
      )}
    </div>
  );
}
