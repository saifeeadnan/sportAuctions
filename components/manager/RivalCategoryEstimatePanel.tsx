"use client";

import { useState } from "react";
import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

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
function ColumnHeader({ label, help }: { label: string; help?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {help && <HelpTooltip title={label}>{help}</HelpTooltip>}
    </span>
  );
}

export function RivalCategoryEstimatePanel({
  rows,
  selfTeamName,
}: {
  rows: RivalCategoryEstimateRow[];
  /** Marks the manager's own row "(you)" in the team list/detail header —
   * matched by name since rows are keyed by teamName, not id. Optional;
   * omitted entirely just skips the marker. */
  selfTeamName?: string;
}) {
  const estimatedRows = rows.filter((r) => r.estimatedBudget != null);
  const teamNames = Array.from(new Set(estimatedRows.map((r) => r.teamName)));
  const [selectedTeam, setSelectedTeam] = useState<string>(teamNames[0] ?? "");
  const [mobileShowingDetail, setMobileShowingDetail] = useState(false);

  if (estimatedRows.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        Set a budget target or estimate for a team above to see its live category affordability
        here.
      </p>
    );
  }

  const effectiveTeam = teamNames.includes(selectedTeam) ? selectedTeam : teamNames[0];
  const teamRows = estimatedRows.filter((r) => r.teamName === effectiveTeam);

  function selectTeam(teamName: string) {
    setSelectedTeam(teamName);
    setMobileShowingDetail(true);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 items-start">
      <div className={`${card} ${mobileShowingDetail ? "hidden md:block" : "block"} overflow-hidden`}>
        <ul className="flex flex-col">
          {teamNames.map((teamName) => {
            const count = estimatedRows.filter((r) => r.teamName === teamName).length;
            return (
              <li key={teamName}>
                <button
                  type="button"
                  onClick={() => selectTeam(teamName)}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left border-b border-black/5 dark:border-white/5 last:border-0 transition-colors ${
                    teamName === effectiveTeam
                      ? "bg-indigo-600/10 dark:bg-indigo-500/15"
                      : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="font-medium truncate">
                    {teamName}
                    {teamName === selfTeamName && (
                      <span className="text-black/50 dark:text-white/50 font-normal"> (you)</span>
                    )}
                  </span>
                  <span className="text-xs text-black/50 dark:text-white/50 shrink-0">
                    {count} categor{count === 1 ? "y" : "ies"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`${card} ${mobileShowingDetail ? "block" : "hidden md:block"} p-4`}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileShowingDetail(false)}
              className="md:hidden text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
            >
              ← Teams
            </button>
            <h4 className="text-sm font-medium">
              {effectiveTeam}
              {effectiveTeam === selfTeamName && (
                <span className="text-black/50 dark:text-white/50 font-normal"> (you)</span>
              )}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4 text-right">
                    <ColumnHeader
                      label="Spent"
                      help={
                        <p>
                          Real money this team has already committed to this category —
                          retention, trade, or a live bid already won. Pure history: your estimate
                          never changes this number, and this number never changes your estimate.
                        </p>
                      }
                    />
                  </th>
                  <th className="py-2 pr-4 text-right">
                    <ColumnHeader
                      label="Bought"
                      help={
                        <p>
                          How many players this team already has in this category, for the same
                          real reasons as &quot;Spent&quot; — retention, trade, or a won live bid.
                        </p>
                      }
                    />
                  </th>
                  <th className="py-2 pr-4 text-right">
                    <ColumnHeader
                      label="Estimate"
                      help={
                        <p>
                          What you set (or, when marked &quot;inferred&quot;, what&apos;s implied
                          by your other categories) for how much more this team spends here.
                        </p>
                      }
                    />
                  </th>
                  <th className="py-2 pr-4 text-right">
                    <ColumnHeader
                      label="Picks left (est.)"
                      help={
                        <p>
                          Your estimate ÷ the average price of real live bids won in this category
                          so far (falls back to its base price before any have). Your estimate is
                          already meant to be <span className="font-medium">spend from here</span>
                          {" "}— it&apos;s never reduced by what they&apos;ve already bought.
                          &quot;Done&quot; means your number rounds to 0 more picks.
                        </p>
                      }
                    />
                  </th>
                  <th className="py-2 text-right">
                    <ColumnHeader
                      label="Affordable (est.)"
                      help={
                        <p>
                          This team&apos;s real current remaining budget, minus whatever you
                          estimated for every <span className="font-medium">other</span> category,
                          split evenly across &quot;Picks left&quot; for this one. Blank when
                          Picks left is 0 — nothing left to divide.
                        </p>
                      }
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((r) => (
                  <tr key={r.categoryName} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1.5">
                        {r.categoryName}
                        {r.isInferred && <Badge variant="neutral">inferred</Badge>}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.actualSpent.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.actualCount}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {r.estimatedBudget != null ? r.estimatedBudget.toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {r.remainingEstimatedCount != null && r.remainingEstimatedCount > 0
                        ? r.remainingEstimatedCount
                        : "Done"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.estimatedAffordablePrice != null
                        ? Math.round(r.estimatedAffordablePrice).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
