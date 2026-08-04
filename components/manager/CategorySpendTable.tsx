import type { CategorySpendOverview } from "@/lib/auction/projectedStandings";
import { card } from "@/lib/ui";

// Same medal treatment as TeamProjectionBoard's category columns — rows are
// already ordered highest base price first.
const CATEGORY_MEDALS = ["🥇", "🥈"];

export function CategorySpendTable({ rows }: { rows: CategorySpendOverview[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No categories yet.</p>;
  }

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-4">Category</th>
            <th className="py-2 pr-4 whitespace-nowrap">Avg spent / player</th>
            <th className="py-2 pr-4 whitespace-nowrap">Avg predicted / player</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.categoryName} className="border-b border-black/5 dark:border-white/5 last:border-0">
              <td className="py-2 pl-4 pr-4">
                {CATEGORY_MEDALS[i] ? `${CATEGORY_MEDALS[i]} ` : ""}
                {r.categoryName}
              </td>
              <td className="py-2 pr-4 tabular-nums">
                {r.avgSpent != null
                  ? `${Math.round(r.avgSpent).toLocaleString()} (${r.soldCount} sold)`
                  : "—"}
              </td>
              <td className="py-2 pr-4 tabular-nums">
                {r.avgPredicted != null
                  ? `${Math.round(r.avgPredicted).toLocaleString()} (${r.predictedCount} predicted)`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
