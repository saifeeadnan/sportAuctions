import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createTeamAction } from "@/lib/actions/tournament.actions";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tournament, managers, auctions] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id },
      include: { roster: true, teams: { include: { manager: true }, orderBy: { createdAt: "asc" } } },
    }),
    prisma.user.findMany({ where: { role: "TEAM_MANAGER" }, orderBy: { name: "asc" } }),
    prisma.auction.findMany({ where: { tournamentId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!tournament) notFound();

  const canAddTeam = tournament.teams.length < tournament.numTeams;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">{tournament.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Roster: {tournament.roster.name} &middot; {tournament.teams.length}/
          {tournament.numTeams} teams &middot; squad size {tournament.squadSize} &middot;{" "}
          {tournament.startDate.toDateString()} – {tournament.endDate.toDateString()}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Teams</h2>
        {tournament.teams.length === 0 ? (
          <p className="text-black/60 dark:text-white/60 mb-4">No teams yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 mb-4">
            {tournament.teams.map((team) => (
              <li
                key={team.id}
                className="flex items-center justify-between rounded border border-black/10 dark:border-white/10 px-4 py-3"
              >
                <span>{team.name}</span>
                <span className="text-sm text-black/60 dark:text-white/60">
                  {team.manager ? team.manager.name : "No manager assigned"}
                  {team.managerOccupiesSlot ? " (occupies a slot)" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canAddTeam ? (
          <form action={createTeamAction} className="flex flex-col gap-3 max-w-sm">
            <input type="hidden" name="tournamentId" value={tournament.id} />
            <label className="flex flex-col gap-1 text-sm">
              Team name
              <input
                name="name"
                required
                className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Manager
              <select
                name="managerId"
                className="border border-black/20 dark:border-white/20 rounded px-3 py-2 bg-transparent"
              >
                <option value="">— None yet —</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="managerOccupiesSlot" defaultChecked />
              Manager occupies a squad slot and costs budget
            </label>
            <button
              type="submit"
              className="mt-2 self-start rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
            >
              Add team
            </button>
          </form>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60">
            Maximum number of teams reached.
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Auctions</h2>
          <Link
            href={`/admin/tournaments/${tournament.id}/auctions/new`}
            className="rounded border border-black/20 dark:border-white/20 px-3 py-2 text-sm font-medium"
          >
            New auction
          </Link>
        </div>
        {auctions.length === 0 ? (
          <p className="text-black/60 dark:text-white/60">No auctions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {auctions.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/auctions/${a.id}`}
                  className="flex items-center justify-between rounded border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span>{a.name}</span>
                  <span className="text-sm text-black/60 dark:text-white/60">{a.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
