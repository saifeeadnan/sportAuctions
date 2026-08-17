"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveRivalCategoryEstimateAction } from "@/lib/actions/rivalCategoryEstimate.actions";
import { card, buttonPrimary, inputClass } from "@/lib/ui";

export type RivalEstimateTeamOption = { id: string; name: string };
export type RivalEstimateCategoryOption = { id: string; name: string };

function cellKey(targetEntryId: string, categoryId: string) {
  return `${targetEntryId}:${categoryId}`;
}

/**
 * A manager's own private estimate of every OTHER team's budget per
 * category — one grid, edited freely, saved as a batch. Never asks about
 * the manager's own team (they know their own budget exactly).
 */
export function RivalCategoryEstimateForm({
  entryId,
  teams,
  categories,
  initialEstimates,
}: {
  entryId: string;
  teams: RivalEstimateTeamOption[];
  categories: RivalEstimateCategoryOption[];
  initialEstimates: { targetEntryId: string; categoryId: string; estimatedBudget: string }[];
}) {
  const router = useRouter();
  const initialMap = new Map(
    initialEstimates.map((e) => [cellKey(e.targetEntryId, e.categoryId), e.estimatedBudget])
  );
  const [values, setValues] = useState<Map<string, string>>(new Map(initialMap));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setValue(targetEntryId: string, categoryId: string, value: string) {
    setSaved(false);
    setValues((prev) => {
      const next = new Map(prev);
      next.set(cellKey(targetEntryId, categoryId), value);
      return next;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    const changedCells = teams.flatMap((team) =>
      categories
        .map((category) => {
          const key = cellKey(team.id, category.id);
          const current = values.get(key) ?? "";
          const initial = initialMap.get(key) ?? "";
          return { team, category, current, initial };
        })
        .filter(({ current, initial }) => current !== initial)
    );

    const results = await Promise.all(
      changedCells.map(({ team, category, current }) =>
        saveRivalCategoryEstimateAction(
          entryId,
          team.id,
          category.id,
          current.trim() === "" ? null : Number(current)
        )
      )
    );

    setLoading(false);
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      setError(firstError);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-black/60 dark:text-white/60">
        Your own private guess at how much each other team plans to spend per category — used to
        estimate what they can still afford. Never shown to anyone else.
      </p>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pl-4 pr-4">Team</th>
              {categories.map((c) => (
                <th key={c.id} className="py-2 pr-4">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="py-2 pl-4 pr-4 font-medium">{team.name}</td>
                {categories.map((category) => (
                  <td key={category.id} className="py-2 pr-4">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No estimate"
                      value={values.get(cellKey(team.id, category.id)) ?? ""}
                      onChange={(e) => setValue(team.id, category.id, e.target.value)}
                      className={`${inputClass} w-28`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Estimates saved.</p>}

      <button onClick={handleSubmit} disabled={loading} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : "Save estimates"}
      </button>
    </div>
  );
}
