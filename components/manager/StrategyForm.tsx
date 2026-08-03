"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveStrategyAction } from "@/lib/actions/auctionStrategy.actions";
import { card, buttonPrimary, inputClass, tabsTrack, tabItem } from "@/lib/ui";

export type StrategyPlayerOption = {
  id: string;
  name: string;
  position: string | null;
  categoryId: string;
  categoryName: string;
  basePrice: string;
};

export type StrategyCategoryOption = { id: string; name: string };

type PreferenceState = "MUST_HAVE" | "AVOID" | null;

export function StrategyForm({
  entryId,
  categories,
  players,
  initialMustHaveIds,
  initialAvoidIds,
  initialBudgetTargets,
}: {
  entryId: string;
  categories: StrategyCategoryOption[];
  players: StrategyPlayerOption[];
  initialMustHaveIds: string[];
  initialAvoidIds: string[];
  initialBudgetTargets: { categoryId: string; targetAvgPrice: string }[];
}) {
  const router = useRouter();
  const [preferences, setPreferences] = useState<Map<string, PreferenceState>>(() => {
    const map = new Map<string, PreferenceState>();
    for (const id of initialMustHaveIds) map.set(id, "MUST_HAVE");
    for (const id of initialAvoidIds) map.set(id, "AVOID");
    return map;
  });
  const [budgetTargets, setBudgetTargets] = useState<Map<string, string>>(
    () => new Map(initialBudgetTargets.map((t) => [t.categoryId, t.targetAvgPrice]))
  );
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  function setPreference(playerId: string, value: PreferenceState) {
    setSaved(false);
    setPreferences((prev) => {
      const next = new Map(prev);
      if (next.get(playerId) === value || value === null) {
        next.delete(playerId);
      } else {
        next.set(playerId, value);
      }
      return next;
    });
  }

  function setBudgetTarget(categoryId: string, value: string) {
    setSaved(false);
    setBudgetTargets((prev) => {
      const next = new Map(prev);
      if (value.trim() === "") {
        next.delete(categoryId);
      } else {
        next.set(categoryId, value);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const mustHaveIds = Array.from(preferences.entries())
        .filter(([, v]) => v === "MUST_HAVE")
        .map(([id]) => id);
      const avoidIds = Array.from(preferences.entries())
        .filter(([, v]) => v === "AVOID")
        .map(([id]) => id);
      const targets = Array.from(budgetTargets.entries())
        .filter(([, value]) => Number(value) > 0)
        .map(([categoryId, value]) => ({ categoryId, targetAvgPrice: Number(value) }));

      await saveStrategyAction(entryId, mustHaveIds, avoidIds, targets);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setLoading(false);
    }
  }

  const visiblePlayers = players.filter((p) => p.categoryId === activeCategory);
  const mustHaveCount = Array.from(preferences.values()).filter((v) => v === "MUST_HAVE").length;
  const avoidCount = Array.from(preferences.values()).filter((v) => v === "AVOID").length;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">Budget target per category</h4>
        <p className="text-xs text-black/60 dark:text-white/60">
          How much you&apos;d like to spend, on average, per player in each category. The guidance
          above uses this to cap what it suggests bidding — leave a category blank to just see
          your legal max instead.
        </p>
        <div className={`${card} p-4 grid grid-cols-1 sm:grid-cols-3 gap-3`}>
          {categories.map((cat) => (
            <label key={cat.id} className="flex flex-col gap-1 text-sm">
              {cat.name}
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="No target"
                value={budgetTargets.get(cat.id) ?? ""}
                onChange={(e) => setBudgetTarget(cat.id, e.target.value)}
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">Must-have &amp; avoid players</h4>
        <p className="text-xs text-black/60 dark:text-white/60">
          Marked {mustHaveCount} must-have, {avoidCount} avoid.
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

        <div className={`${card} max-h-[420px] overflow-y-auto`}>
          <ul className="flex flex-col gap-1.5 p-2">
            {visiblePlayers.map((p) => {
              const state = preferences.get(p.id) ?? null;
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="flex-1">
                    {p.name} {p.position ? `(${p.position})` : ""}
                  </span>
                  <span className="text-black/60 dark:text-white/60 mr-2">base {p.basePrice}</span>
                  <button
                    type="button"
                    onClick={() => setPreference(p.id, "MUST_HAVE")}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      state === "MUST_HAVE"
                        ? "bg-emerald-600 text-white"
                        : "bg-black/[0.05] dark:bg-white/[0.08] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                    }`}
                  >
                    Must-have
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreference(p.id, "AVOID")}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      state === "AVOID"
                        ? "bg-red-600 text-white"
                        : "bg-black/[0.05] dark:bg-white/[0.08] text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                    }`}
                  >
                    Avoid
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Strategy saved.</p>}

      <button onClick={handleSubmit} disabled={loading} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : "Save strategy"}
      </button>
    </div>
  );
}
