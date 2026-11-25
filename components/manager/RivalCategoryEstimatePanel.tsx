"use client";

import { useState } from "react";
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
function CategoryStatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-black/50 dark:text-white/50">{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function RivalCategoryEstimatePanel({ rows }: { rows: RivalCategoryEstimateRow[] }) {
  const estimatedRows = rows.filter((r) => r.estimatedBudget != null);
  const teamNames = Array.from(new Set(estimatedRows.map((r) => r.teamName)));
  const [selectedTeam, setSelectedTeam] = useState<string>(teamNames[0] ?? "");
  const [mobileShowingDetail, setMobileShowingDetail] = useState(false);

  if (estimatedRows.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        Set a budget estimate for another team above to see their live category affordability here.
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
                  <span className="font-medium truncate">{teamName}</span>
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
            <h4 className="text-sm font-medium">{effectiveTeam}</h4>
          </div>
          <ul className="flex flex-col gap-3">
            {teamRows.map((r) => (
              <li
                key={r.categoryName}
                className="flex flex-col gap-2 rounded-lg border border-black/[0.06] dark:border-white/10 p-3"
              >
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  {r.categoryName}
                  {r.isInferred && <Badge variant="neutral">inferred</Badge>}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <CategoryStatTile label="Spent" value={r.actualSpent.toLocaleString()} />
                  <CategoryStatTile label="Bought" value={String(r.actualCount)} />
                  <CategoryStatTile
                    label="Picks left (est.)"
                    value={
                      r.remainingEstimatedCount != null && r.remainingEstimatedCount > 0
                        ? String(r.remainingEstimatedCount)
                        : "Done"
                    }
                  />
                  <CategoryStatTile
                    label="Affordable (est.)"
                    value={
                      r.estimatedAffordablePrice != null
                        ? Math.round(r.estimatedAffordablePrice).toLocaleString()
                        : "—"
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
