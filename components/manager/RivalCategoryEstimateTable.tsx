"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRivalCategoryEstimateAction } from "@/lib/actions/rivalCategoryEstimate.actions";
import { saveCategoryBudgetTargetAction } from "@/lib/actions/auctionStrategy.actions";
import { card, inputClass } from "@/lib/ui";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export type RivalEstimateTeamOption = { id: string; name: string };
export type RivalEstimateCategoryOption = { id: string; name: string; basePrice: number };
export type RivalEstimateTeamContext = { budgetRemaining: number; slotsToFill: number };

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

function cellKey(targetEntryId: string, categoryId: string) {
  return `${targetEntryId}:${categoryId}`;
}

function ColumnHeader({ label, help }: { label: string; help?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {help && <HelpTooltip title={label}>{help}</HelpTooltip>}
    </span>
  );
}

/**
 * One table, per selected team, with the editable budget target/estimate
 * cell and its live analytics (Spent/Bought/Picks left/Affordable) in the
 * same row — supersedes the old split of a separate edit grid
 * (RivalCategoryEstimateForm) and a separate read-only analytics panel
 * (RivalCategoryEstimatePanel), which duplicated the team-list navigation
 * for what was conceptually one "look at this team" task. The manager's own
 * row (teams[].id === entryId) is a real, live-editable budget target, saved
 * one cell at a time via saveCategoryBudgetTargetAction; every other row is
 * this manager's own private guess at that team's spend, saved via
 * saveRivalCategoryEstimateAction.
 *
 * Every cell autosaves on blur (same pattern as Predictions' picker)
 * instead of batching every edit behind one "Save" button — see
 * autosave-wishlist-budgets-plan.md.
 */
export function RivalCategoryEstimateTable({
  entryId,
  teams,
  categories,
  initialEstimates,
  teamContextById,
  analyticsRows,
}: {
  entryId: string;
  teams: RivalEstimateTeamOption[];
  categories: RivalEstimateCategoryOption[];
  initialEstimates: { targetEntryId: string; categoryId: string; estimatedBudget: string }[];
  /** Each team's current live budgetRemaining + slots still to fill, shown
   * alongside the selected team's category table as a sizing aid (e.g. "6
   * slots, 1800L left" suggests ~300L/slot on average) and for the running-
   * total/remaining readout below it. Optional — omitted entirely (not
   * shown as 0) wherever a caller doesn't have it. */
  teamContextById?: Record<string, RivalEstimateTeamContext>;
  /** Server-computed, keyed by team/category NAME (not id) since that's
   * what computeRivalCategoryEstimates already returns — covers every
   * team x category pair, including ones with no estimate set at all. */
  analyticsRows: RivalCategoryEstimateRow[];
}) {
  const router = useRouter();
  const initialMap = new Map(
    initialEstimates.map((e) => [cellKey(e.targetEntryId, e.categoryId), e.estimatedBudget])
  );
  const [values, setValues] = useState<Map<string, string>>(new Map(initialMap));
  // Last server-confirmed value per cell — what a blur diffs against (skip
  // the write if nothing actually changed) and what an error reverts to.
  const [committed, setCommitted] = useState<Map<string, string>>(new Map(initialMap));
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const analyticsByKey = new Map(analyticsRows.map((r) => [`${r.teamName}:${r.categoryName}`, r]));

  function setValue(targetEntryId: string, categoryId: string, value: string) {
    setValues((prev) => {
      const next = new Map(prev);
      next.set(cellKey(targetEntryId, categoryId), value);
      return next;
    });
  }

  async function handleBlur(team: RivalEstimateTeamOption, category: RivalEstimateCategoryOption) {
    const key = cellKey(team.id, category.id);
    const current = (values.get(key) ?? "").trim();
    const previous = committed.get(key) ?? "";
    if (current === previous) return; // nothing actually changed — skip the write

    const amount = current === "" ? null : Number(current);
    if (amount != null && Number.isNaN(amount)) {
      setErrors((prev) => ({ ...prev, [key]: "Must be a number" }));
      return;
    }

    // Cross-cell check against this team's starting purse -- values already
    // reflects `current` for this cell (onChange wrote it before blur could
    // fire), so this sums every category's latest typed amount, not just
    // this one. Blocks the save entirely (no autosave) rather than letting
    // the total silently go over; the typed value is left as-is so the
    // manager can adjust it down.
    const context = teamContextById?.[team.id];
    if (context != null) {
      const totalForTeam = categories.reduce(
        (sum, c) => sum + (Number(values.get(cellKey(team.id, c.id))) || 0),
        0
      );
      if (totalForTeam > context.budgetRemaining) {
        setErrors((prev) => ({
          ...prev,
          [key]: `Estimate total (${totalForTeam.toLocaleString()}) would exceed the starting purse (${context.budgetRemaining.toLocaleString()})`,
        }));
        return;
      }
    }

    setErrors((prev) => ({ ...prev, [key]: "" }));
    setPendingCells((prev) => new Set(prev).add(key));

    const result =
      team.id === entryId
        ? await saveCategoryBudgetTargetAction(entryId, category.id, amount)
        : await saveRivalCategoryEstimateAction(entryId, team.id, category.id, amount);

    setPendingCells((prev) => {
      const set = new Set(prev);
      set.delete(key);
      return set;
    });

    if (result.error) {
      setErrors((prev) => ({ ...prev, [key]: result.error }));
      setValues((prev) => {
        const next = new Map(prev);
        if (previous === "") next.delete(key);
        else next.set(key, previous);
        return next;
      });
      return;
    }
    setCommitted((prev) => new Map(prev).set(key, current));
    router.refresh();
  }

  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? "");
  // md+ always shows list+detail side by side regardless of this flag; below
  // md it switches which single pane is visible (list first, detail after a
  // team's tapped) — see the className toggles below.
  const [mobileShowingDetail, setMobileShowingDetail] = useState(false);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const isSelfSelected = selectedTeam?.id === entryId;
  const selectedTeamContext = selectedTeam ? teamContextById?.[selectedTeam.id] : undefined;
  const estimateSum = selectedTeam
    ? categories.reduce((sum, c) => sum + (Number(values.get(cellKey(selectedTeam.id, c.id))) || 0), 0)
    : 0;
  const estimateRemaining = selectedTeamContext != null ? selectedTeamContext.budgetRemaining - estimateSum : null;

  function selectTeam(teamId: string) {
    setSelectedTeamId(teamId);
    setMobileShowingDetail(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-black/60 dark:text-white/60">
        Your own budget target per category, plus your private guess at every other team's — and
        what each has actually spent/bought and can likely still afford, right alongside it. Never
        shown to anyone else. Saved automatically as you edit.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 items-start">
        <div className={`${card} ${mobileShowingDetail ? "hidden md:block" : "block"} overflow-hidden`}>
          <ul className="flex flex-col">
            {teams.map((team) => {
              const estimatedCount = categories.filter((c) => {
                const v = values.get(cellKey(team.id, c.id));
                return v != null && v.trim() !== "";
              }).length;
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => selectTeam(team.id)}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left border-b border-black/5 dark:border-white/5 last:border-0 transition-colors ${
                      team.id === selectedTeamId
                        ? "bg-indigo-600/10 dark:bg-indigo-500/15"
                        : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="font-medium truncate">
                      {team.name}
                      {team.id === entryId && (
                        <span className="text-black/50 dark:text-white/50 font-normal"> (you)</span>
                      )}
                    </span>
                    <span className="text-xs text-black/50 dark:text-white/50 shrink-0">
                      {estimatedCount}/{categories.length}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${card} ${mobileShowingDetail ? "block" : "hidden md:block"} p-4`}>
          {selectedTeam && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMobileShowingDetail(false)}
                  className="md:hidden text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                >
                  ← Teams
                </button>
                <h4 className="text-sm font-medium">{selectedTeam.name}</h4>
                {selectedTeamContext && (
                  <span className="text-xs text-black/60 dark:text-white/60">
                    {selectedTeamContext.slotsToFill} slot{selectedTeamContext.slotsToFill === 1 ? "" : "s"} to fill
                  </span>
                )}
                <span className="text-xs text-black/60 dark:text-white/60 ml-auto flex items-center gap-3">
                  {selectedTeamContext && (
                    <span>
                      Starting purse:{" "}
                      <span className="font-medium text-black dark:text-white tabular-nums">
                        {selectedTeamContext.budgetRemaining.toLocaleString()}
                      </span>
                    </span>
                  )}
                  <span>
                    Estimate total:{" "}
                    <span className="font-medium text-black dark:text-white tabular-nums">
                      {estimateSum.toLocaleString()}
                    </span>
                  </span>
                  {estimateRemaining != null && (
                    <span className={estimateRemaining < 0 ? "text-red-600 dark:text-red-400 font-medium" : undefined}>
                      Left:{" "}
                      <span className="font-medium tabular-nums">
                        {estimateRemaining < 0 ? "-" : ""}
                        {Math.abs(estimateRemaining).toLocaleString()}
                      </span>
                    </span>
                  )}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-black/10 dark:border-white/10">
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4 text-right">{isSelfSelected ? "Target" : "Estimate"}</th>
                      <th className="py-2 pr-4 text-right">
                        <ColumnHeader
                          label="Spent"
                          help={
                            <p>
                              Real money this team has already committed to this category —
                              retention, trade, or a live bid already won. Pure history: your
                              estimate never changes this number, and this number never changes
                              your estimate.
                            </p>
                          }
                        />
                      </th>
                      <th className="py-2 pr-4 text-right">
                        <ColumnHeader
                          label="Bought"
                          help={
                            <p>
                              How many players this team already has in this category, for the
                              same real reasons as &quot;Spent&quot; — retention, trade, or a won
                              live bid.
                            </p>
                          }
                        />
                      </th>
                      <th className="py-2 pr-4 text-right">
                        <ColumnHeader
                          label="Picks left (est.)"
                          help={
                            <p>
                              Your estimate ÷ the average price of real live bids won in this
                              category so far (falls back to its base price before any have).
                              Your estimate is already meant to be{" "}
                              <span className="font-medium">spend from here</span> — it&apos;s
                              never reduced by what they&apos;ve already bought. &quot;Done&quot;
                              means your number rounds to 0 more picks.
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
                              estimated for every <span className="font-medium">other</span>{" "}
                              category, split evenly across &quot;Picks left&quot; for this one.
                              Blank when Picks left is 0 — nothing left to divide.
                            </p>
                          }
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => {
                      const key = cellKey(selectedTeam.id, category.id);
                      const analytics = analyticsByKey.get(`${selectedTeam.name}:${category.name}`);
                      const rawValue = values.get(key) ?? "";
                      const placeholder =
                        rawValue === "" && analytics?.isInferred && analytics.estimatedBudget != null
                          ? `~${Math.round(analytics.estimatedBudget).toLocaleString()} inferred`
                          : isSelfSelected
                          ? "No target"
                          : "No estimate";
                      return (
                        <tr key={category.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                          <td className="py-2 pr-4">
                            {category.name}{" "}
                            <span className="text-xs text-black/50 dark:text-white/50">
                              (base {category.basePrice.toLocaleString()})
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder={placeholder}
                              value={rawValue}
                              onChange={(e) => setValue(selectedTeam.id, category.id, e.target.value)}
                              onBlur={() => handleBlur(selectedTeam, category)}
                              disabled={pendingCells.has(key)}
                              className={`${inputClass} w-28 text-right`}
                            />
                            {errors[key] && (
                              <p className="text-xs text-red-600 dark:text-red-400 text-left">{errors[key]}</p>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {(analytics?.actualSpent ?? 0).toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">{analytics?.actualCount ?? 0}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {analytics?.remainingEstimatedCount != null
                              ? analytics.remainingEstimatedCount > 0
                                ? analytics.remainingEstimatedCount
                                : "Done"
                              : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {analytics?.estimatedAffordablePrice != null
                              ? Math.round(analytics.estimatedAffordablePrice).toLocaleString()
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
