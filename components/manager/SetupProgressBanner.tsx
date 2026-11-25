"use client";

import { useEffect, useState } from "react";
import { card, buttonSecondary } from "@/lib/ui";

export type SetupChecklistItem = {
  key: string;
  label: string;
  done: boolean;
};

/**
 * Lightweight "N of M set up" nudge — modeled on OnBall's "4 of 50 players
 * rated by you" banner. Deliberately not a step-sequence wizard (see
 * components/ui/WizardProgress.tsx, which is for an actual ordered flow):
 * these 4 setup areas aren't ordered or mutually required, so this is just a
 * dismissible progress readout with a jump-to-the-first-gap button.
 */
export function SetupProgressBanner({
  storageKey,
  items,
  onJump,
}: {
  /** Unique per team entry — localStorage is per-origin, not per-entry, so
   * this keys the dismissal to the specific auction+team viewing it. */
  storageKey: string;
  items: SetupChecklistItem[];
  onJump: (key: string) => void;
}) {
  const doneCount = items.filter((i) => i.done).length;
  const allDone = items.length > 0 && doneCount === items.length;
  const [dismissedAtCount, setDismissedAtCount] = useState<number | null>(null);

  // Remembers dismissal per entry, but only while the done-count hasn't
  // dropped since — if a previously-done area becomes incomplete again (e.g.
  // a prediction gets cleared), the banner reappears instead of staying
  // hidden forever.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) setDismissedAtCount(Number(raw));
    } catch {
      // Private browsing / blocked storage — fine, banner just won't persist dismissal.
    }
  }, [storageKey]);

  function dismiss() {
    setDismissedAtCount(doneCount);
    try {
      localStorage.setItem(storageKey, String(doneCount));
    } catch {
      // ignore
    }
  }

  const isDismissed = dismissedAtCount != null && doneCount <= dismissedAtCount;
  if (allDone || isDismissed || items.length === 0) return null;

  const firstIncomplete = items.find((i) => !i.done);

  return (
    <div className={`${card} px-4 py-3 flex items-center gap-3 flex-wrap shrink-0`}>
      <div className="flex-1 min-w-[180px] flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          {doneCount} of {items.length} set up
        </span>
        <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500 transition-[width]"
            style={{ width: `${(doneCount / items.length) * 100}%` }}
          />
        </div>
      </div>
      {firstIncomplete && (
        <button type="button" onClick={() => onJump(firstIncomplete.key)} className={buttonSecondary}>
          Finish setup
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss setup reminder"
        className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white text-lg leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}
