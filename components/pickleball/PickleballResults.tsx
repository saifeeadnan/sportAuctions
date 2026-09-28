import type { PickleballMatchView } from "@/lib/services/pickleballEvent.service";
import { card } from "@/lib/ui";

function ResultBadge({ match }: { match: PickleballMatchView }) {
  if (!match.result.isDecided) {
    return <span className="text-xs text-black/50 dark:text-white/50">In progress</span>;
  }
  const winnerName = match.result.winnerId === match.team1Id ? match.team1Name : match.team2Name;
  return (
    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
      {winnerName} won {match.result.team1GamesWon}–{match.result.team2GamesWon}
    </span>
  );
}

/** Every match, grouped by round, with a per-game scoreline. Shared by the
 * admin preview and the public/OBS views. */
export function PickleballResults({ matches }: { matches: PickleballMatchView[] }) {
  if (matches.length === 0) return <p className="text-sm text-black/60 dark:text-white/60">No matches yet.</p>;
  const rounds = [...new Set(matches.map((m) => m.round))];

  return (
    <div className="flex flex-col gap-6">
      {rounds.map((round) => (
        <section key={round} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Round {round}</h3>
          <div className="flex flex-col gap-2">
            {matches
              .filter((m) => m.round === round)
              .map((m) => (
                <div key={m.id} className={`${card} px-4 py-3 flex flex-col gap-2`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-sm font-medium">
                      {m.team1Name} <span className="text-black/40 dark:text-white/40">vs</span> {m.team2Name}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-black/50 dark:text-white/50">
                        Group {m.group}
                        {m.court ? ` · ${m.court}` : ""}
                      </span>
                      <ResultBadge match={m} />
                    </div>
                  </div>
                  {/* One row per game, not a column — a match can have more than 3
                      games, and a row-per-game table scales to any count without
                      wrapping awkwardly the way side-by-side columns would. */}
                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      {m.games.map((g) => (
                        <tr key={g.gameNumber} className="border-b border-black/5 dark:border-white/5 last:border-0">
                          <td className="py-1 pr-3 align-top text-black/40 dark:text-white/40 whitespace-nowrap">
                            Game {g.gameNumber}
                          </td>
                          <td className="py-1 pr-3 align-top tabular-nums font-medium text-black dark:text-white whitespace-nowrap">
                            {g.team1Score ?? "–"}–{g.team2Score ?? "–"}
                          </td>
                          <td className="py-1 align-top text-black/60 dark:text-white/60">
                            {g.team1Players.length > 0 || g.team2Players.length > 0
                              ? `${g.team1Players.join(" & ") || "—"} vs ${g.team2Players.join(" & ") || "—"}`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
