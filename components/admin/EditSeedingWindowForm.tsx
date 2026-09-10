"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertSeedingWindowAction } from "@/lib/actions/playerSeeding.actions";
import { toDateInputValue } from "@/lib/dates";
import { inputClass, selectClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

const MAX_SEED_OPTIONS = [5, 10, 20];

export function EditSeedingWindowForm({
  rosterId,
  hasWindow,
  opensAt,
  closesAt,
  maxSeed,
  disabled,
}: {
  rosterId: string;
  hasWindow: boolean;
  /** Already "YYYY-MM-DD" (toDateInputValue), or null when no window exists yet. */
  opensAt: string | null;
  closesAt: string | null;
  maxSeed: number;
  /** True once the window is finalized — reopening isn't supported, so the
   * edit control is hidden entirely rather than shown and rejected. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opensAtValue, setOpensAtValue] = useState(opensAt ?? toDateInputValue(new Date()));
  const [closesAtValue, setClosesAtValue] = useState(closesAt ?? toDateInputValue(new Date()));
  const [maxSeedValue, setMaxSeedValue] = useState(String(maxSeed));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabled) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonSecondary}>
        {hasWindow ? "Edit rating window" : "Open rating window"}
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await upsertSeedingWindowAction(rosterId, {
      opensAt: opensAtValue,
      closesAt: closesAtValue,
      maxSeed: Number(maxSeedValue),
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
    <div className="flex flex-col gap-2 max-w-sm">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Opens
          <input
            type="date"
            value={opensAtValue}
            onChange={(e) => setOpensAtValue(e.target.value)}
            className={`${inputClass} py-1 text-xs`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Closes
          <input
            type="date"
            value={closesAtValue}
            onChange={(e) => setClosesAtValue(e.target.value)}
            className={`${inputClass} py-1 text-xs`}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs">
        Max seed value
        <select
          value={maxSeedValue}
          onChange={(e) => setMaxSeedValue(e.target.value)}
          className={`${selectClass} py-1 text-xs`}
        >
          {MAX_SEED_OPTIONS.map((n) => (
            <option key={n} value={n}>
              1–{n}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
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
          onClick={() => setOpen(false)}
          className={`${buttonSecondary} px-2 py-1 text-xs`}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
