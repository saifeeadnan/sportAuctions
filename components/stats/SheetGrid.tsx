"use client";

import { useMemo, useState } from "react";
import type { SheetSection } from "@/lib/statsSheetGrid";
import { headingsOfSections } from "@/lib/statsPublish";
import { containsText, findInSections } from "@/lib/statsTableView";
import { ColumnPicker } from "@/components/stats/ColumnPicker";
import { Highlighted, SheetTable } from "@/components/stats/SheetTable";

/**
 * One sheet as read-only, sortable, filterable tables. A plain sheet is one
 * table; a stacked leaderboard sheet (titled blocks separated by blank rows)
 * is one table per block, each with its own sorting and filters; notes stay as
 * text. A "find" box narrows every table of the sheet to the rows containing
 * what was typed, and picks it out; "Columns" lets a visitor hide the columns
 * they don't want. Shared by the admin view and the public page so both show
 * exactly the same thing.
 */
export function SheetGrid({ sections }: { sections: SheetSection[] }) {
  const [find, setFind] = useState("");
  // headings the visitor has hidden (normalised); applies to every table of this sheet
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const headings = useMemo(() => headingsOfSections(sections), [sections]);
  const counts = useMemo(() => findInSections(sections, find, hidden), [sections, find, hidden]);
  const finding = find.trim() !== "";
  const total = counts.reduce((sum, n) => sum + n, 0);
  const sectionsWithMatches = counts.filter((n) => n > 0).length;

  if (sections.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">This sheet is empty.</p>;
  }

  // a sheet that is a single table scrolls inside its card; while finding, the sections without a match step aside
  const single = sections.length === 1 && sections[0].kind === "table";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="search"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          aria-label="Find in this sheet"
          placeholder="Find in this sheet"
          autoComplete="off"
          className="w-full max-w-xs rounded-lg border border-black/15 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60"
        />
        {finding && (
          <p className="text-xs text-black/50 dark:text-white/50" aria-live="polite">
            {total === 0
              ? "No match"
              : `${total.toLocaleString("en-US")} match${total === 1 ? "" : "es"}${sectionsWithMatches > 1 ? ` in ${sectionsWithMatches} tables` : ""}`}
          </p>
        )}
        {headings.length >= 2 && <ColumnPicker headings={headings} hidden={hidden} onChange={setHidden} />}
      </div>

      {finding && total === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">Nothing in this sheet contains “{find.trim()}”.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section, i) => {
            if (finding && counts[i] === 0) return null;
            if (section.kind === "table") {
              return (
                <SheetTable
                  key={`${i}:${section.header.join("|")}`}
                  title={section.title}
                  header={section.header}
                  rows={section.rows}
                  scrollBody={single}
                  find={find}
                  hidden={hidden}
                />
              );
            }
            const lines = finding ? section.lines.filter((line) => containsText(line, find)) : section.lines;
            return (
              <div key={i} className="flex flex-col gap-1 text-sm text-black/70 dark:text-white/70 break-words [overflow-wrap:anywhere]">
                {lines.map((line, j) => (
                  <p key={j}>
                    <Highlighted text={line} find={find} />
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
