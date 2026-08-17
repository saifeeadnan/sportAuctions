import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type RivalCategoryEstimateRow = {
  teamName: string;
  categoryName: string;
  estimatedBudget: number | null;
  isInferred: boolean;
  actualSpent: number;
  actualCount: number;
  remainingEstimatedCount: number | null;
  estimatedAffordablePrice: number | null;
};

/**
 * Read-only: what each team has actually spent/bought per category so far,
 * and — where this manager set an estimate — roughly what they can still
 * afford to pay for their next pick in it. Informative only, never a
 * directive.
 */
export function RivalCategoryEstimatePanel({ rows }: { rows: RivalCategoryEstimateRow[] }) {
  const estimatedRows = rows.filter((r) => r.estimatedBudget != null);

  if (estimatedRows.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        Set a budget estimate for another team above to see their live category affordability here.
      </p>
    );
  }

  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-black/10 dark:border-white/10">
            <th className="py-2 pl-4 pr-4">Team</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4 text-right">Spent</th>
            <th className="py-2 pr-4 text-right">Bought</th>
            <th className="py-2 pr-4 text-right">Picks left (est.)</th>
            <th className="py-2 pr-4 text-right whitespace-nowrap">Affordable price (est.)</th>
          </tr>
        </thead>
        <tbody>
          {estimatedRows.map((r) => (
            <tr
              key={`${r.teamName}:${r.categoryName}`}
              className="border-b border-black/5 dark:border-white/5 last:border-0"
            >
              <td className="py-2 pl-4 pr-4">{r.teamName}</td>
              <td className="py-2 pr-4">
                <span className="inline-flex items-center gap-1.5">
                  {r.categoryName}
                  {r.isInferred && <Badge variant="neutral">inferred</Badge>}
                </span>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.actualSpent.toLocaleString()}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.actualCount}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {r.remainingEstimatedCount != null && r.remainingEstimatedCount > 0
                  ? r.remainingEstimatedCount
                  : "Done"}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {r.estimatedAffordablePrice != null ? Math.round(r.estimatedAffordablePrice).toLocaleString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
