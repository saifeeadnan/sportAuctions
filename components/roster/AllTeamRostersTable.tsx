import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { teamRosterGridRowCount, type TeamRosterGrid } from "@/lib/teamRosterGrid";

/** Every team's final roster side by side — one column per team, one row per
 * roster position, each cell "player + category". Wide by nature (a column
 * per team), so it scrolls sideways inside its own card rather than
 * squeezing names onto several lines. */
export function AllTeamRostersTable({ grid }: { grid: TeamRosterGrid }) {
  if (grid.teams.length === 0) {
    return <p className="text-sm text-black/60 dark:text-white/60">No teams took part in this auction.</p>;
  }

  const rowCount = teamRosterGridRowCount(grid);

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-2 w-10">#</th>
            {grid.teams.map((team) => (
              <th key={team.entryId} className="py-2 pr-4 min-w-[10rem] align-bottom">
                <span className="block">{team.teamName}</span>
                {team.isMine && <Badge variant="info">Your team</Badge>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, i) => (
            <tr key={i} className="border-b border-black/5 dark:border-white/5 last:border-0 align-top">
              <td className="py-2 pl-4 pr-2 text-black/50 dark:text-white/50">{i + 1}</td>
              {grid.teams.map((team) => {
                const member = team.members[i];
                return (
                  <td key={team.entryId} className="py-2 pr-4">
                    {member && (
                      <>
                        {member.name}{" "}
                        <span className="text-xs text-black/50 dark:text-white/50">{member.categoryName}</span>
                      </>
                    )}
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
