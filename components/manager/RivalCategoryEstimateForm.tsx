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

  const [selectedTeamId, setSelectedTeamId] = useState<string>(teams[0]?.id ?? "");
  // md+ always shows list+detail side by side regardless of this flag; below
  // md it switches which single pane is visible (list first, detail after a
  // team's tapped) — see the className toggles below.
  const [mobileShowingDetail, setMobileShowingDetail] = useState(false);

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

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  function selectTeam(teamId: string) {
    setSelectedTeamId(teamId);
    setMobileShowingDetail(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-black/60 dark:text-white/60">
        Your own private guess at how much each other team plans to spend per category — used to
        estimate what they can still afford. Never shown to anyone else.
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
                    <span className="font-medium truncate">{team.name}</span>
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {categories.map((category) => (
                  <label key={category.id} className="flex flex-col gap-1 text-sm">
                    {category.name}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="No estimate"
                      value={values.get(cellKey(selectedTeam.id, category.id)) ?? ""}
                      onChange={(e) => setValue(selectedTeam.id, category.id, e.target.value)}
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">Estimates saved.</p>}

      <button onClick={handleSubmit} disabled={loading} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : "Save estimates"}
      </button>
    </div>
  );
}
