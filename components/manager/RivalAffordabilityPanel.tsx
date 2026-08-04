import type { RivalAffordabilityWarning } from "@/lib/auction/projectedStandings";

/** Sanity-checks the manager's own predictions against real, public budget
 * data — not a comment on any team's strategy, just "these can't all be
 * true at once." */
export function RivalAffordabilityPanel({
  warnings,
}: {
  warnings: RivalAffordabilityWarning[];
}) {
  if (warnings.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        No conflicts — your predictions fit within each team&apos;s remaining budget.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {warnings.map((w) => (
        <li
          key={w.teamId}
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm"
        >
          <p>
            <span className="font-medium">{w.teamName}</span> — your predictions for them total{" "}
            <span className="font-medium">{w.predictedTotal.toLocaleString()}</span>, but they only
            have <span className="font-medium">{w.budgetRemaining.toLocaleString()}</span> left.
          </p>
          <p className="text-xs text-black/60 dark:text-white/60 mt-1">
            Over by {w.overBy.toLocaleString()} — some of these predictions can&apos;t all come true
            at those prices.
          </p>
        </li>
      ))}
    </ul>
  );
}
