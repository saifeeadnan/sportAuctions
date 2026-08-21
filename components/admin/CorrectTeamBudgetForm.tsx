"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { correctTeamBudgetAction } from "@/lib/actions/auctionCorrection.actions";
import { inputClass, buttonPrimary } from "@/lib/ui";

export function CorrectTeamBudgetForm({
  auctionId,
  teamBudget,
}: {
  auctionId: string;
  teamBudget: string;
}) {
  const router = useRouter();
  const [budget, setBudget] = useState(teamBudget);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!budget.trim()) return;
    setLoading(true);
    setError(null);
    const result = await correctTeamBudgetAction(auctionId, Number(budget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-sm">
      <label className="flex flex-col gap-1 text-sm">
        Team budget
        <input
          type="number"
          min={0}
          step="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={loading || !budget.trim()} className={`${buttonPrimary} self-start`}>
        {loading ? "Saving…" : "Correct budget"}
      </button>
    </form>
  );
}
