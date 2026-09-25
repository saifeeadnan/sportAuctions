"use client";

import { useMemo } from "react";
import type { StatsGrid } from "@/lib/statsUpload/schema";
import { splitSheet } from "@/lib/statsSheetGrid";
import { SheetTable } from "@/components/stats/SheetTable";

/**
 * One uploaded sheet as read-only, sortable, filterable tables. A plain sheet
 * is one table; a stacked leaderboard sheet (titled blocks separated by blank
 * rows) becomes one table per block, each with its own sorting and filters;
 * notes and headings stay as text. Shared by the admin view and the public
 * page so both show exactly the same thing.
 */
export function SheetGrid({ grid }: { grid: StatsGrid }) {
  const sections = useMemo(() => splitSheet(grid), [grid]);
  const single = sections.length === 1 && sections[0].kind === "table";

  if (sections.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">This sheet is empty.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section, i) =>
        section.kind === "table" ? (
          <SheetTable key={`${i}:${section.header.join("|")}`} title={section.title} header={section.header} rows={section.rows} scrollBody={single} />
        ) : (
          <div key={i} className="flex flex-col gap-1 text-sm text-black/70 dark:text-white/70 break-words [overflow-wrap:anywhere]">
            {section.lines.map((line, j) => (
              <p key={j}>{line}</p>
            ))}
          </div>
        )
      )}
    </div>
  );
}
