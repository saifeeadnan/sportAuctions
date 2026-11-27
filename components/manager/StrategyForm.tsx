"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPlayerPreferenceAction, saveCategoryBudgetTargetAction } from "@/lib/actions/auctionStrategy.actions";
import { card, inputClass, tabsTrack, tabItem } from "@/lib/ui";

export type StrategyPlayerOption = {
  id: string;
  name: string;
  position: string | null;
  categoryId: string;
  categoryName: string;
  basePrice: string;
};

export type StrategyCategoryOption = { id: string; name: string; basePrice: number };

type PreferenceState = "MUST_HAVE" | "AVOID" | null;

export function StrategyForm({
  entryId,
  categories,
  players,
  initialMustHaveIds,
  initialAvoidIds,
  initialBudgetTargets,
  budgetRemaining,
  showBudgetTargets = true,
}: {
  entryId: string;
  categories: StrategyCategoryOption[];
  players: StrategyPlayerOption[];
  initialMustHaveIds: string[];
  initialAvoidIds: string[];
  initialBudgetTargets: { categoryId: string; targetAvgPrice: string }[];
  /** Team's current live budget, for the running-total/remaining readout
   * below the category grid. Optional — omitted entirely (not shown as 0)
   * wherever a caller doesn't have it handy. */
  budgetRemaining?: number;
  /** v1's AnalyticsDashboardPage has no "My estimates" tab, so this is its
   * only way to set budget targets — default true, unchanged for it. v2
   * passes false: budget targets (including the manager's own) are set
   * from the merged "My estimates" grid instead, one category at a time. */
  showBudgetTargets?: boolean;
}) {
  const router = useRouter();

  // Every toggle/blur below autosaves immediately (same pattern as
  // Predictions' V2PredictionPicker) instead of batching behind one "Save"
  // button that could scroll out of view or get discarded by a tab switch —
  // see autosave-wishlist-budgets-plan.md for why. `preferences`/
  // `budgetTargets` hold the last-known-good (server-confirmed, or
  // optimistically-applied) state; the pending/error maps track each
  // individual player/category's own in-flight request.
  const [preferences, setPreferences] = useState<Map<string, PreferenceState>>(() => {
    const map = new Map<string, PreferenceState>();
    for (const id of initialMustHaveIds) map.set(id, "MUST_HAVE");
    for (const id of initialAvoidIds) map.set(id, "AVOID");
    return map;
  });
  const [pendingPlayerIds, setPendingPlayerIds] = useState<Set<string>>(new Set());
  const [playerErrors, setPlayerErrors] = useState<Record<string, string>>({});

  const [budgetTargets, setBudgetTargets] = useState<Map<string, string>>(
    () => new Map(initialBudgetTargets.map((t) => [t.categoryId, t.targetAvgPrice]))
  );
  const [pendingCategoryIds, setPendingCategoryIds] = useState<Set<string>>(new Set());
  const [budgetErrors, setBudgetErrors] = useState<Record<string, string>>({});

  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");

  async function togglePreference(playerId: string, value: "MUST_HAVE" | "AVOID") {
    const previous = preferences.get(playerId) ?? null;
    const next = previous === value ? null : value; // clicking the active one again clears it

    setPreferences((prev) => {
      const map = new Map(prev);
      if (next === null) map.delete(playerId);
      else map.set(playerId, next);
      return map;
    });
    setPlayerErrors((prev) => ({ ...prev, [playerId]: "" }));
    setPendingPlayerIds((prev) => new Set(prev).add(playerId));

    const result = await setPlayerPreferenceAction(entryId, playerId, next);

    setPendingPlayerIds((prev) => {
      const set = new Set(prev);
      set.delete(playerId);
      return set;
    });

    if (result.error) {
      setPreferences((prev) => {
        const map = new Map(prev);
        if (previous === null) map.delete(playerId);
        else map.set(playerId, previous);
        return map;
      });
      setPlayerErrors((prev) => ({ ...prev, [playerId]: result.error }));
      return;
    }
    router.refresh();
  }

  function setBudgetTargetDraft(categoryId: string, value: string) {
    setBudgetTargets((prev) => {
      const next = new Map(prev);
      if (value.trim() === "") next.delete(categoryId);
      else next.set(categoryId, value);
      return next;
    });
  }

  async function handleBudgetTargetBlur(categoryId: string, rawValue: string) {
    const trimmed = rawValue.trim();
    const amount = trimmed === "" ? null : Number(trimmed);
    if (amount != null && (Number.isNaN(amount) || amount <= 0)) {
      setBudgetErrors((prev) => ({ ...prev, [categoryId]: "Must be a number greater than 0" }));
      return;
    }
    setBudgetErrors((prev) => ({ ...prev, [categoryId]: "" }));
    setPendingCategoryIds((prev) => new Set(prev).add(categoryId));

    const result = await saveCategoryBudgetTargetAction(entryId, categoryId, amount);

    setPendingCategoryIds((prev) => {
      const set = new Set(prev);
      set.delete(categoryId);
      return set;
    });

    if (result.error) {
      setBudgetErrors((prev) => ({ ...prev, [categoryId]: result.error }));
      return;
    }
    router.refresh();
  }

  const visiblePlayers = players.filter((p) => p.categoryId === activeCategory);
  const mustHaveCount = Array.from(preferences.values()).filter((v) => v === "MUST_HAVE").length;
  const avoidCount = Array.from(preferences.values()).filter((v) => v === "AVOID").length;

  // Each target is a per-category AVERAGE price (not a total allocation), so
  // this sum is a rough one-pick-per-category gut-check, not a literal
  // spending plan — worded in the UI below as "target sum", not "planned
  // spend", to avoid overstating its precision.
  const targetSum = Array.from(budgetTargets.values()).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const remaining = budgetRemaining != null ? budgetRemaining - targetSum : null;

  return (
    <div className="flex flex-col gap-5">
      {showBudgetTargets && (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-medium">Budget target per category</h4>
          <p className="text-xs text-black/50 dark:text-white/50">Saved automatically as you edit.</p>
          <div className={`${card} p-4 flex flex-col gap-3`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {categories.map((cat) => (
                <label key={cat.id} className="flex flex-col gap-1 text-sm">
                  <span>
                    {cat.name}{" "}
                    <span className="text-xs text-black/50 dark:text-white/50">
                      (base {cat.basePrice.toLocaleString()})
                    </span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No target"
                    value={budgetTargets.get(cat.id) ?? ""}
                    onChange={(e) => setBudgetTargetDraft(cat.id, e.target.value)}
                    onBlur={(e) => handleBudgetTargetBlur(cat.id, e.target.value)}
                    disabled={pendingCategoryIds.has(cat.id)}
                    className={inputClass}
                  />
                  {budgetErrors[cat.id] && (
                    <p className="text-xs text-red-600 dark:text-red-400">{budgetErrors[cat.id]}</p>
                  )}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t border-black/[0.06] dark:border-white/10">
              <span className="text-black/60 dark:text-white/60">
                Target sum{" "}
                <span className="font-medium text-black dark:text-white tabular-nums">
                  {targetSum.toLocaleString()}
                </span>
              </span>
              {remaining != null && (
                <span className={remaining < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-black/60 dark:text-white/60"}>
                  {remaining < 0 ? "Over budget by " : "Remaining "}
                  <span className="tabular-nums font-medium">{Math.abs(remaining).toLocaleString()}</span>
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">Must-have &amp; avoid players</h4>
        <p className="text-xs text-black/60 dark:text-white/60">
          Marked {mustHaveCount} must-have, {avoidCount} avoid. Saved automatically as you tap.
        </p>

        <div className={tabsTrack}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={tabItem(activeCategory === cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className={card}>
          <ul className="flex flex-col gap-1.5 p-2">
            {visiblePlayers.map((p) => {
              const state = preferences.get(p.id) ?? null;
              const isPending = pendingPlayerIds.has(p.id);
              const error = playerErrors[p.id];
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-1 text-sm px-3 py-2 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1">{p.name}</span>
                    <span className="text-black/60 dark:text-white/60 mr-2">base {p.basePrice}</span>
                    <button
                      type="button"
                      onClick={() => togglePreference(p.id, "MUST_HAVE")}
                      disabled={isPending}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        state === "MUST_HAVE"
                          ? "bg-emerald-600 text-white"
                          : "bg-black/[0.05] dark:bg-white/[0.08] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                      }`}
                    >
                      Must-have
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePreference(p.id, "AVOID")}
                      disabled={isPending}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        state === "AVOID"
                          ? "bg-red-600 text-white"
                          : "bg-black/[0.05] dark:bg-white/[0.08] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                      }`}
                    >
                      Avoid
                    </button>
                  </div>
                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
