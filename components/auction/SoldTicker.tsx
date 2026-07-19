import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";
import { card } from "@/lib/ui";

function byMostRecentFirst(a: AuctionStatePlayer, b: AuctionStatePlayer): number {
  const aTime = a.soldAt ? new Date(a.soldAt).getTime() : 0;
  const bTime = b.soldAt ? new Date(b.soldAt).getTime() : 0;
  return bTime - aTime;
}

export function SoldTicker({
  players,
  teams,
}: {
  players: AuctionStatePlayer[];
  teams: AuctionStateTeam[];
}) {
  const soldByTeam = new Map<string, AuctionStatePlayer[]>();
  for (const team of teams) soldByTeam.set(team.teamName, []);
  for (const p of players) {
    if (p.status === "SOLD" && p.soldToTeamName) {
      soldByTeam.get(p.soldToTeamName)?.push(p);
    }
  }
  for (const list of soldByTeam.values()) {
    list.sort(byMostRecentFirst);
  }

  const unsold = players
    .filter((p) => p.status === "UNSOLD")
    .sort((a, b) => a.name.localeCompare(b.name));

  const columnNames = [...teams.map((t) => t.teamName), "Unsold"];
  const columnLists = [...teams.map((t) => soldByTeam.get(t.teamName) ?? []), unsold];
  const maxRows = Math.max(0, ...columnLists.map((list) => list.length));

  if (maxRows === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players resolved yet.</p>;
  }

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            {columnNames.map((name, i) => (
              <th
                key={name}
                className={`py-2 align-bottom whitespace-nowrap ${i === 0 ? "pl-4 pr-4" : "pr-4"}`}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="border-b border-black/5 dark:border-white/5 last:border-0">
              {columnLists.map((list, colIndex) => {
                const player = list[rowIndex];
                const isUnsoldColumn = colIndex === columnLists.length - 1;
                return (
                  <td
                    key={colIndex}
                    className={`py-2 align-top whitespace-nowrap ${colIndex === 0 ? "pl-4 pr-4" : "pr-4"}`}
                  >
                    {player ? (
                      isUnsoldColumn ? (
                        <span className="text-black/60 dark:text-white/60">{player.name}</span>
                      ) : (
                        <span>
                          {player.name}{" "}
                          <span className="text-black/50 dark:text-white/50">
                            ({player.soldPrice})
                          </span>
                        </span>
                      )
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
