"use client";

import { useId, useState } from "react";
import { buttonSecondary } from "@/lib/ui";
import { normHeading } from "@/lib/statsTableView";

/**
 * "Columns": choose which columns of a sheet you see. Ticked means showing. A
 * heading used by several tables of the sheet (Player, Runs) is shown or hidden
 * in all of them. This only changes what this visitor's browser draws; the
 * admin's own hiding, which removes columns from what is sent at all, is in the
 * admin's "Tabs and columns".
 *
 * Renders a button plus, while open, a panel that takes its own full-width line
 * in the toolbar it is placed in — inline rather than a floating popover, so it
 * can never run off the edge of a small screen.
 */
export function ColumnPicker({
  headings,
  hidden,
  onChange,
}: {
  /** Every distinct heading in the sheet, in order. */
  headings: string[];
  /** Headings hidden, as normHeading writes them. */
  hidden: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hiddenCount = headings.filter((h) => hidden.has(normHeading(h))).length;

  function toggle(heading: string) {
    const next = new Set(hidden);
    const key = normHeading(heading);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`${buttonSecondary} px-3 py-1.5 text-sm`}
      >
        Columns{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Choose the columns to show"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="basis-full flex flex-col gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <button type="button" className="underline underline-offset-2" onClick={() => onChange(new Set())}>
              Show all
            </button>
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => onChange(new Set(headings.map((h) => normHeading(h))))}
            >
              Hide all
            </button>
            <span className="text-black/50 dark:text-white/50">
              {headings.length - hiddenCount} of {headings.length} showing
            </span>
            <button type="button" className="ml-auto underline underline-offset-2" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
            {headings.map((heading) => (
              <li key={heading} className="min-w-0">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!hidden.has(normHeading(heading))} onChange={() => toggle(heading)} />
                  <span className="min-w-0 truncate" title={heading}>
                    {heading}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
