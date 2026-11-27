"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRivalCategoryEstimateAction } from "@/lib/actions/rivalCategoryEstimate.actions";
import { saveCategoryBudgetTargetAction } from "@/lib/actions/auctionStrategy.actions";
import { card, inputClass } from "@/lib/ui";

export type RivalEstimateTeamOption = { id: string; name: string };
export type RivalEstimateCategoryOption = { id: string; name: string; basePrice: number };

function cellKey(targetEntryId: string, categoryId: string) {
  return `${targetEntryId}:${categoryId}`;
}

export type RivalEstimateTeamContext = { budgetRemaining: number; slotsToFill: number };

/**
 * One grid for every team's budget per category, including the manager's
 * own — edited freely. The manager's own row (teams[].id === entryId) is a
 * real, live-editable budget target (same data Strategy's must-have/avoid
 * picker and the Simulate/bid-guidance engines read), saved one cell at a
 * time via saveCategoryBudgetTargetAction; every other row is this
 * manager's own private guess at that team's spend, saved via
 * saveRivalCategoryEstimateAction. Both render through the exact same
 * grid/table so the manager's own category breakdown finally gets the same
 * Picks left/Affordable readout rivals get, instead of living in a
 * separate, differently-shaped place.
 *
 * Every cell autosaves on blur (same pattern as Predictions'
 * V2PredictionPicker) instead of batching every edit behind one "Save"
 * button that could scroll out of view or get discarded by a tab switch —
 * see autosave-wishlist-budgets-plan.md.
 */
export function RivalCategoryEstimateForm({
  entryId,
  teams,
  categories,
  initialEstimates,
  teamContextById,
}: {
  entryId: string;
  teams: RivalEstimateTeamOption[];
  categories: RivalEstimateCategoryOption[];
  initialEstimates: { targetEntryId: string; categoryId: string; estimatedBudget: string }[];
  /** Each team's current live budgetRemaining + slots still to fill, shown
   * alongside the selected team's category grid as a sizing aid (e.g. "6
   * slots, 1800L left" suggests ~300L/slot on average) and for the running-
   * total/remaining readout below it. Optional — omitted entirely (not
   * shown as 0) wherever a caller doesn't have it. */
  teamContextById?: Record<string, RivalEstimateTeamContext>;
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
        Your own budget target per category, plus your private guess at every other team's — used
        to estimate what each can still afford. Never shown to anyone else. Saved automatically as
        you edit.
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
              <div className="flex items-center gap-2">
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
                    {`${selectedTeamContext.slotsToFill} slot${selectedTeamContext.slotsToFill === 1 ? "" : "s"} to fill · ${selectedTeamContext.budgetRemaining.toLocaleString()} left`}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {categories.map((category) => {
                  const key = cellKey(selectedTeam.id, category.id);
                  return (
                    <label key={category.id} className="flex flex-col gap-1 text-sm">
                      <span>
                        {category.name}{" "}
                        <span className="text-xs text-black/50 dark:text-white/50">
                          (base {category.basePrice.toLocaleString()})
                        </span>
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={isSelfSelected ? "No target" : "No estimate"}
                        value={values.get(key) ?? ""}
                        onChange={(e) => setValue(selectedTeam.id, category.id, e.target.value)}
                        onBlur={() => handleBlur(selectedTeam, category)}
                        disabled={pendingCells.has(key)}
                        className={inputClass}
                      />
                      {errors[key] && <p className="text-xs text-red-600 dark:text-red-400">{errors[key]}</p>}
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-black/[0.06] dark:border-white/10">
                <span className="text-black/60 dark:text-white/60">
                  {isSelfSelected ? "Target sum" : "Estimate sum"}{" "}
                  <span className="font-medium text-black dark:text-white tabular-nums">
                    {estimateSum.toLocaleString()}
                  </span>
                </span>
                {estimateRemaining != null && (
                  <span className={estimateRemaining < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-black/60 dark:text-white/60"}>
                    {estimateRemaining < 0 ? `Over ${isSelfSelected ? "your" : "their"} budget by ` : "Remaining "}
                    <span className="tabular-nums font-medium">{Math.abs(estimateRemaining).toLocaleString()}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
