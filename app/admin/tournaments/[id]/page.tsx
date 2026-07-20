import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createTeamAction } from "@/lib/actions/tournament.actions";
import { DeleteAuctionButton } from "@/components/admin/DeleteAuctionButton";
import { card, cardInteractive, buttonPrimary, buttonSecondary, inputClass } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const AUCTION_STATUS_VARIANT: Record<string, "neutral" | "info" | "success" | "warning"> = {
  BIDDING: "info",
  COMPLETED: "success",
  PRE_AUCTION_OPEN: "warning",
  PRE_AUCTION_LOCKED: "warning",
};

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
    <div className="flex flex-col gap-6">
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
                className={`${cardInteractive} flex items-center justify-between px-4 py-3`}
              >
                <Link
                  href={`/admin/tournaments/${tournament.id}/teams/${team.id}`}
                  className="underline underline-offset-2"
                >
                  {team.name}
                </Link>
                <span className="text-sm text-black/60 dark:text-white/60">
                  {team.manager ? team.manager.name : "No manager assigned"}
                  {team.managerOccupiesSlot ? " (occupies a slot)" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canAddTeam ? (
          <details className={card}>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              Add team
            </summary>
            <form action={createTeamAction} className="flex flex-col gap-3 max-w-sm px-4 pb-4">
              <input type="hidden" name="tournamentId" value={tournament.id} />
              <label className="flex flex-col gap-1 text-sm">
                Team name
                <input name="name" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Manager
                <select name="managerId" className={inputClass}>
                  <option value="">— None yet —</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.loginId})
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="managerOccupiesSlot" value="off" />
              <button type="submit" className={`${buttonPrimary} mt-2 self-start`}>
                Add team
              </button>
            </form>
          </details>
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
            className={`${buttonSecondary} px-3 py-2 text-sm`}
          >
            New auction
          </Link>
        </div>
        {auctions.length === 0 ? (
          <p className="text-black/60 dark:text-white/60">No auctions yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {auctions.map((a) => (
              <li
                key={a.id}
                className={`${cardInteractive} flex items-center justify-between gap-4 px-4 py-3`}
              >
                <Link
                  href={`/admin/auctions/${a.id}`}
                  className="flex-1 flex items-center justify-between hover:underline"
                >
                  <span>{a.name}</span>
                  <span className="mr-4">
                    <Badge variant={AUCTION_STATUS_VARIANT[a.status] ?? "neutral"}>{a.status}</Badge>
                  </span>
                </Link>
                <DeleteAuctionButton auctionId={a.id} auctionName={a.name} status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
