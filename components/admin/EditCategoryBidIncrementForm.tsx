"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCategoryBidIncrementAction } from "@/lib/actions/auction.actions";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

export function EditCategoryBidIncrementForm({
  auctionId,
  categoryId,
  bidIncrement,
}: {
  auctionId: string;
  categoryId: string;
  bidIncrement: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(bidIncrement ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        {bidIncrement ? `+${bidIncrement} (edit)` : "Set increment"}
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      await updateCategoryBidIncrementAction(
        auctionId,
        categoryId,
        value.trim() ? Number(value) : null
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update bid increment");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="No increment"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} py-1 text-xs w-28`}
        />
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
            setValue(bidIncrement ?? "");
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
