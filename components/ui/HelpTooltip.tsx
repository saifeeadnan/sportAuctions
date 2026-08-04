"use client";

import { useEffect, useRef, useState } from "react";

/** A tap-to-toggle help popover, not hover-based — this app is used live on
 * managers' phones during bidding, where hover doesn't exist. */
export function HelpTooltip({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Help: ${title}`}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-black/20 dark:border-white/25 text-[10px] leading-none text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white hover:border-black/40 dark:hover:border-white/40 transition-colors"
      >
        ?
      </button>
      {open && (
        <div className="absolute z-30 top-6 left-0 w-72 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg p-3 text-xs leading-relaxed text-black/70 dark:text-white/70">
          {children}
        </div>
      )}
    </div>
  );
}
