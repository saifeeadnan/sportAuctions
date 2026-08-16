import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveAdminScope } from "@/lib/auth/scope";
import { listLeagues, isLeagueReadOnly } from "@/lib/services/league.service";
import { DeleteRosterButton } from "@/components/admin/DeleteRosterButton";
import { UploadRosterForm } from "@/components/roster/UploadRosterForm";
import { card, cardInteractive } from "@/lib/ui";

export async function RostersPanel({ selectedLeagueId }: { selectedLeagueId?: string }) {
  const { leagueIds } = await resolveAdminScope(selectedLeagueId);
  // Single, definite leagueId for the "my league" banner/read-only check —
  // only meaningful once scope has narrowed to exactly one league.
  const leagueId = leagueIds?.length === 1 ? leagueIds[0] : undefined;

  const [rosters, leagues, myLeague] = await Promise.all([
    prisma.playerRoster.findMany({
      where: leagueIds ? { leagueId: { in: leagueIds } } : {},
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { players: true, tournaments: true } } },
    }),
    leagueIds ? Promise.resolve(null) : listLeagues(),
    leagueId ? prisma.league.findUnique({ where: { id: leagueId }, select: { endDate: true } }) : Promise.resolve(null),
  ]);

  // A League Admin has no league picker (always their own fixed league), so
  // if it's read-only the whole "upload" section is blocked outright.
  const myLeagueReadOnly = myLeague != null && isLeagueReadOnly(myLeague);

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Player rosters</h2>

      {myLeagueReadOnly ? (
        <div className={`${card} mb-6 px-4 py-3 text-sm text-black/60 dark:text-white/60`}>
          Upload roster — this league is read-only.
        </div>
      ) : (
        <details className={`${card} mb-6`}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            Upload roster
          </summary>
          <UploadRosterForm
            leagues={leagues?.map((l) => ({ id: l.id, name: l.name, readOnly: isLeagueReadOnly(l) }))}
          />
        </details>
      )}

      {rosters.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No rosters yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rosters.map((roster) => (
            <li key={roster.id} className={`${cardInteractive} flex items-center justify-between gap-4 px-4 py-3`}>
              <Link
                href={`/admin/rosters/${roster.id}${selectedLeagueId ? `?league=${selectedLeagueId}` : ""}`}
                className="flex-1 flex items-center justify-between hover:underline"
              >
                <span>{roster.name}</span>
                <span className="text-sm text-black/60 dark:text-white/60 mr-4">
                  {roster._count.players} players
                </span>
              </Link>
              <DeleteRosterButton
                rosterId={roster.id}
                rosterName={roster.name}
                inUseCount={roster._count.tournaments}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
