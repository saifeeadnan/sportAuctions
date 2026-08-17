import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import type { RosterAffordability } from "@/lib/auction/rosterAffordability";

/**
 * Every team's average affordability (budget left ÷ slots still to fill),
 * ranked highest first — live, since budgets and slots change as the
 * auction progresses. A full roster shows "Full" instead of a rank.
 */
export function RosterAffordabilityPanel({
  rows,
  myTeamId,
}: {
  rows: RosterAffordability[];
  myTeamId: string;
}) {
  if (rows.length === 0) return null;

  // Every row carries the same category keys in the same order (computeRosterAffordability
  // fills zeros for categories a team hasn't bought into), so the first row's keys are the
  // full, correctly-ordered column set.
  const categories = Object.keys(rows[0].categoryCounts);

  let rank = 0;
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-2 w-8">#</th>
            <th className="py-2 pr-4">Team</th>
            <th className="py-2 pr-4 text-right whitespace-nowrap">Avg affordability</th>
            <th className="py-2 pr-4 text-right">Budget left</th>
            <th className="py-2 pr-4 text-right">Slots to fill</th>
            {categories.map((c) => (
              <th key={c} className="py-2 pr-2 text-right whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            if (r.averageAffordability != null) rank += 1;
            return (
              <tr key={r.teamId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="py-2 pl-4 pr-2 text-black/50 dark:text-white/50">
                  {r.averageAffordability != null ? rank : "—"}
                </td>
                <td className="py-2 pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    {r.teamName}
                    {r.teamId === myTeamId && <Badge variant="info">You</Badge>}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {r.averageAffordability != null ? Math.round(r.averageAffordability).toLocaleString() : "Full"}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{r.budgetRemaining.toLocaleString()}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{r.slotsToFill}</td>
                {categories.map((c) => (
                  <td key={c} className="py-2 pr-2 text-right tabular-nums">
                    {r.categoryCounts[c]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
