import type { TeamProjection } from "@/lib/auction/projectedStandings";
import { card } from "@/lib/ui";

// Categories are already ordered highest base price first (see
// computeProjectedStandings) — a medal on the top two calls out the
// priciest, most contested categories at a glance.
const CATEGORY_MEDALS = ["🥇", "🥈"];

function formatCountCell(counts: { sold: number; predicted: number }): string {
  if (counts.sold === 0 && counts.predicted === 0) return "—";
  return counts.predicted > 0 ? `${counts.sold} (${counts.predicted})` : String(counts.sold);
}

export function TeamProjectionBoard({
  projections,
  myTeamId,
}: {
  projections: TeamProjection[];
  myTeamId?: string;
}) {
  if (projections.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No teams to compare yet.</p>;
  }

  const categories = Object.keys(projections[0].categoryCounts);

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-4">Team</th>
            <th className="py-2 pr-4 whitespace-nowrap">Team size</th>
            <th className="py-2 pr-4 whitespace-nowrap">Purse left</th>
            <th className="py-2 pr-4 whitespace-nowrap">Predicted reserve</th>
            {categories.map((c, i) => (
              <th key={c} className="py-2 pr-4 whitespace-nowrap">
                {CATEGORY_MEDALS[i] ? `${CATEGORY_MEDALS[i]} ` : ""}
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projections.map((p) => {
            const isMine = p.teamId === myTeamId;
            return (
              <tr key={p.teamId} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="py-2 pl-4 pr-4">
                  <span className={isMine ? "font-semibold text-indigo-700 dark:text-indigo-300" : ""}>
                    {p.teamName}
                    {isMine ? " (you)" : ""}
                  </span>
                </td>
                <td className="py-2 pr-4 tabular-nums">{formatCountCell(p.rosterCount)}</td>
                <td className="py-2 pr-4 tabular-nums">{p.budgetRemaining}</td>
                <td className="py-2 pr-4 tabular-nums">
                  {p.predictedReserve > 0 ? p.predictedReserve.toLocaleString() : "—"}
                </td>
                {categories.map((c) => (
                  <td key={c} className="py-2 pr-4 tabular-nums">
                    {formatCountCell(p.categoryCounts[c])}
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
