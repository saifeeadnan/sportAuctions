"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConfirmDeleteButton({
  confirmMessage,
  action,
  disabledReason,
  label = "Delete",
  loadingLabel = "Deleting…",
  className,
}: {
  confirmMessage: string;
  action: () => Promise<void>;
  disabledReason?: string;
  label?: string;
  loadingLabel?: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabledReason) {
    return (
      <span
        className={className ?? "text-xs text-black/40 dark:text-white/40"}
        title={disabledReason}
      >
        {label}
      </span>
    );
  }

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) return;
    setLoading(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className={
          className ??
          "text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 underline underline-offset-2 transition-colors disabled:opacity-50"
        }
      >
        {loading ? loadingLabel : label}
      </button>
      {error && <span className="text-xs text-red-600 max-w-[16rem] text-right">{error}</span>}
    </div>
  );
}
