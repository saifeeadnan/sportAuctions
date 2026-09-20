"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateScheduledStartAtAction } from "@/lib/actions/auction.actions";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

export function EditScheduledStartAtForm({
  auctionId,
  /** Already-formatted "YYYY-MM-DDTHH:mm" in Eastern time (via
   * lib/dates.ts's toZonedDateTimeInputValue), or "" if none is set. */
  initialValue,
}: {
  auctionId: string;
  initialValue: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        {initialValue ? "Edit start time" : "Set start time"}
      </button>
    );
  }

  async function save(next: string | null) {
    setLoading(true);
    setError(null);
    const result = await updateScheduledStartAtAction(auctionId, next);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} py-1 text-xs`}
        />
        <button
          type="button"
          disabled={loading || !value.trim()}
          onClick={() => save(value)}
          className={`${buttonPrimary} px-2 py-1 text-xs`}
        >
          {loading ? "Saving…" : "Save"}
        </button>
        {initialValue && (
          <button
            type="button"
            disabled={loading}
            onClick={() => save(null)}
            className={`${buttonSecondary} px-2 py-1 text-xs`}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setValue(initialValue);
            setOpen(false);
          }}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-black/50 dark:text-white/50">Times are Eastern (ET).</p>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
