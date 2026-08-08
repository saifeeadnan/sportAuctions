"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { renameRosterAction } from "@/lib/actions/roster.actions";
import { inputClass, buttonPrimary, buttonSecondary } from "@/lib/ui";

export function RenameRosterForm({ rosterId, name }: { rosterId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline underline-offset-2"
      >
        Rename
      </button>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    const result = await renameRosterAction(rosterId, value);
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
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} py-1 text-sm`}
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
            setValue(name);
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
