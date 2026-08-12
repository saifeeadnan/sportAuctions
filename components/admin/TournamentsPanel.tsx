import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/scope";
import { listLeagues, isLeagueReadOnly } from "@/lib/services/league.service";
import { DeleteTournamentButton } from "@/components/admin/DeleteTournamentButton";
import { createTournamentAction } from "@/lib/actions/tournament.actions";
import { ActionResultForm } from "@/components/ui/ActionResultForm";
import { card, cardInteractive, buttonPrimary, inputClass, selectClass } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export async function TournamentsPanel({ selectedLeagueId }: { selectedLeagueId?: string }) {
  const { session, leagueId } = await resolveAdminScope(selectedLeagueId);
  // Whether to show the leagueId picker must key off the caller's real,
  // unrestricted role — not the display-narrowed `leagueId` above, which a
  // site ADMIN's sidebar league switcher can make non-null even though
  // createTournamentAction (via requireAdminOrLeagueAdmin) is still
  // unrestricted and needs an explicit leagueId whenever no roster is picked.
  const isSiteAdmin = session.user.role === "ADMIN";

  const [tournaments, rosters, leagues, myLeague] = await Promise.all([
    prisma.tournament.findMany({
      where: leagueId ? { leagueId } : {},
      orderBy: { createdAt: "desc" },
      include: {
        roster: true,
        _count: { select: { teams: true, auctions: true } },
        auctions: { select: { status: true } },
      },
    }),
    prisma.playerRoster.findMany({
      where: leagueId ? { leagueId } : {},
      include: { league: true },
      orderBy: { name: "asc" },
    }),
    isSiteAdmin ? listLeagues() : Promise.resolve(null),
    !isSiteAdmin && leagueId
      ? prisma.league.findUnique({ where: { id: leagueId }, select: { endDate: true } })
      : Promise.resolve(null),
  ]);

  // A League Admin has no league picker (always their own fixed league), so
  // if it's read-only the whole "create" form is blocked outright. A site
  // ADMIN instead sees read-only leagues marked (not removed) in the picker
  // below, since they might still want to pick a different, active league.
  const myLeagueReadOnly = myLeague != null && isLeagueReadOnly(myLeague);

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Tournaments</h2>

      {myLeagueReadOnly ? (
        <div className={`${card} mb-6 px-4 py-3 text-sm text-black/60 dark:text-white/60`}>
          New tournament — this league is read-only.
        </div>
      ) : (
      <details className={`${card} mb-6`}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          New tournament
        </summary>
        <ActionResultForm action={createTournamentAction} className="flex flex-col gap-3 max-w-xl px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Tournament name
              <input name="name" required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Player roster
              <select name="rosterId" defaultValue="" className={selectClass}>
                <option value="">— No roster yet, attach later —</option>
                {leagueId
                  ? rosters.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))
                  : Object.entries(
                      rosters.reduce<Record<string, typeof rosters>>((acc, r) => {
                        const key = r.league?.name ?? "No league";
                        (acc[key] ??= []).push(r);
                        return acc;
                      }, {})
                    ).map(([leagueName, group]) => (
                      <optgroup key={leagueName} label={leagueName}>
                        {group.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
              </select>
            </label>
          </div>
          {leagues && (
            <label className="flex flex-col gap-1 text-sm">
              League (only used if no roster is selected above)
              <select name="leagueId" defaultValue={leagueId ?? ""} className={selectClass}>
                <option value="">— Select a league —</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id} disabled={isLeagueReadOnly(l)}>
                    {l.name}
                    {isLeagueReadOnly(l) ? " (read-only)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Number of teams
              <input name="numTeams" type="number" min={2} required className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Players per team (squad size)
              <input name="squadSize" type="number" min={1} required className={inputClass} />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        </ActionResultForm>
      </details>
      )}

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
                  href={`/admin/tournaments/${t.id}${selectedLeagueId ? `?league=${selectedLeagueId}` : ""}`}
                  className="flex-1 flex items-center gap-3 hover:underline"
                >
                  <span className="flex-1 flex items-center justify-between">
                    <span>
                      {t.name}{" "}
                      <span className="text-black/50 dark:text-white/50">
                        ({t.roster?.name ?? "no roster attached"})
                      </span>
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
