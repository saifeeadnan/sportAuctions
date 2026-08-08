"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAuctionTeamSettingsAction } from "@/lib/actions/auction.actions";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

export function EditAuctionTeamSettingsForm({
  auctionId,
  teamBudget,
  squadSize,
}: {
  auctionId: string;
  teamBudget: string;
  squadSize: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState(teamBudget);
  const [slots, setSlots] = useState(String(squadSize));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        Edit budget / squad size
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await updateAuctionTeamSettingsAction(auctionId, {
      newTeamBudget: budget.trim() ? Number(budget) : undefined,
      newSquadSize: slots.trim() ? Number(slots) : undefined,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      <p className="text-xs text-black/60 dark:text-white/60 max-w-md">
        Applies to every team in this auction immediately, even mid-bidding. A budget change
        shifts every team&apos;s remaining budget by the same amount (money already spent is
        preserved); a squad-size change sets every team&apos;s slot cap to this exact number.
        Any change that would put a team into deficit or below its already-filled slots is
        rejected entirely — nothing is changed for any team.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-xs">
          Team budget
          <input
            type="number"
            min={0}
            step="0.01"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className={`${inputClass} py-1 text-xs w-28`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          Squad size
          <input
            type="number"
            min={1}
            step="1"
            value={slots}
            onChange={(e) => setSlots(e.target.value)}
            className={`${inputClass} py-1 text-xs w-20`}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={handleSave}
          className={`${buttonPrimary} px-2 py-1 text-xs`}
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setBudget(teamBudget);
            setSlots(String(squadSize));
            setOpen(false);
          }}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
