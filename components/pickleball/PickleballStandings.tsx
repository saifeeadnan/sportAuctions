import type { PickleballMatchView, PickleballStandingsRowView } from "@/lib/services/pickleballEvent.service";
import { card } from "@/lib/ui";

/** One group's standings table per group, ranked exactly as
 * lib/pickleball/standings.ts computed them (match wins, then games won,
 * then point diff). Shared by the admin preview and the public/OBS views so
 * all three render identically. */
export function PickleballStandings({
  standings,
  matches,
}: {
  standings: PickleballStandingsRowView[];
  /** The event's full, unfiltered matches (not narrowed by any search) — used
   * only to mark a group "Final" once every one of its matches is decided.
   * Omit to skip that badge entirely. */
  matches?: PickleballMatchView[];
}) {
  const groups = [...new Set(standings.map((r) => r.group))];
  if (groups.length === 0) return <p className="text-sm text-black/60 dark:text-white/60">No teams yet.</p>;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-black/50 dark:text-white/50">
        Ranked by match wins, then games won, then point differential.
      </p>
      {groups.map((group) => {
        const groupMatches = matches?.filter((m) => m.group === group) ?? [];
        const isFinal = groupMatches.length > 0 && groupMatches.every((m) => m.result.isDecided);
        return (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Group {group}
              {isFinal && (
                <span className="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  Final
                </span>
              )}
            </h3>
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-left text-xs text-black/50 dark:text-white/50">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Team</th>
                    <th className="px-3 py-2 font-medium text-right">MP</th>
                    <th className="px-3 py-2 font-medium text-right">W</th>
                    <th className="px-3 py-2 font-medium text-right">L</th>
                    <th className="px-3 py-2 font-medium text-right">Games</th>
                    <th className="px-3 py-2 font-medium text-right">Pts</th>
                    <th className="px-3 py-2 font-medium text-right">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {standings
                    .filter((r) => r.group === group)
                    .map((r) => (
                      <tr key={r.teamId} className="border-b border-black/5 dark:border-white/5 last:border-0 even:bg-black/[0.02] dark:even:bg-white/[0.03]">
                        <td className="px-3 py-2 tabular-nums">{r.rank}</td>
                        <td className="px-3 py-2 font-medium">{r.teamName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.matchesPlayed}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.matchWins}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.matchLosses}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.gamesWon}–{r.gamesLost}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.pointsFor}–{r.pointsAgainst}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
