"use client";

import { useMemo, useState } from "react";
import { card } from "@/lib/ui";
import { classifyColumns, columnWidths, viewRows, type SortState } from "@/lib/statsTableView";

// Wider tables get smaller type and tighter padding so they still fit their
// container — there is deliberately no horizontal scrolling anywhere: the
// table uses a fixed layout with proportional columns and its text wraps.
// charPx/padPx mirror the classes so columnWidths can size columns from them.
function density(columns: number) {
  if (columns <= 8) return { text: "text-sm", pad: "px-3 py-1.5", charPx: 7.6, padPx: 24 };
  if (columns <= 14) return { text: "text-xs", pad: "px-2 py-1.5", charPx: 6.5, padPx: 16 };
  if (columns <= 18) return { text: "text-[11px]", pad: "px-1.5 py-1", charPx: 6, padPx: 12 };
  return { text: "text-[11px] max-md:text-[10px]", pad: "px-1 py-1", charPx: 6, padPx: 8 };
}

const CONTROL =
  "mt-1 block w-full min-w-0 rounded border border-black/15 dark:border-white/15 px-1 py-0.5 text-[11px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500/50";

/**
 * One table of a sheet. Every column sorts: click a header (ascending,
 * descending, back to sheet order). The columns you pick rows by — names,
 * teams, years, results — also filter: a dropdown where a column repeats a few
 * values, a search box for names; measures such as runs get no filter. Filters
 * combine. Alternate rows are shaded, following the order on screen rather than
 * the order in the file.
 */
export function SheetTable({
  title,
  header,
  rows,
  scrollBody,
}: {
  title: string | null;
  header: string[];
  rows: string[][];
  /** A sheet that is a single table scrolls vertically inside its card with a
   * sticky header; one of several tables just flows down the page. */
  scrollBody: boolean;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<string[]>(() => header.map(() => ""));

  const columns = useMemo(() => classifyColumns(rows, header.length), [rows, header.length]);
  const d = density(header.length);
  const widths = useMemo(
    () => columnWidths(header, rows, columns, { charPx: d.charPx, padPx: d.padPx }),
    [header, rows, columns, d.charPx, d.padPx]
  );
  const shown = useMemo(() => viewRows(rows, columns, filters, sort), [rows, columns, filters, sort]);
  const filtering = columns.some((col, c) => col.filter !== "none" && (filters[c] ?? "").trim() !== "");

  function cycleSort(column: number) {
    setSort((prev) => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

  function setFilter(column: number, value: string) {
    setFilters((prev) => prev.map((f, i) => (i === column ? value : f)));
  }

  const label = (c: number) => header[c].trim() || `Column ${c + 1}`;

  return (
    <section className="flex flex-col gap-2">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      <div className={`${card} overflow-x-hidden ${scrollBody ? "max-h-[75vh] overflow-y-auto" : ""}`}>
        <table className={`w-full table-fixed border-collapse ${d.text}`}>
          <colgroup>
            {widths.map((w, c) => (
              <col key={c} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {header.map((_, c) => {
                const sorted = sort?.column === c ? sort.direction : null;
                const column = columns[c];
                return (
                  <th
                    key={c}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                    className={`${scrollBody ? "sticky top-0 z-10" : ""} bg-white dark:bg-neutral-900 border-b border-black/10 dark:border-white/10 align-top font-semibold ${d.pad} ${
                      column.numeric ? "text-right" : "text-left"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => cycleSort(c)}
                      title={`Sort by ${label(c)}`}
                      className={`flex w-full items-start gap-1 font-semibold hover:text-indigo-600 dark:hover:text-indigo-300 ${
                        column.numeric ? "justify-end text-right" : "text-left"
                      }`}
                    >
                      {/* Wraps at spaces; a word wider than its column is clipped with an ellipsis (the full name is the button's tooltip). */}
                      <span className="min-w-0 overflow-hidden text-ellipsis">{header[c]}</span>
                      <span aria-hidden className={`shrink-0 ${sorted ? "text-indigo-600 dark:text-indigo-300" : "opacity-30"}`}>
                        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                      </span>
                    </button>
                    {column.filter === "select" && (
                      // Forced light, like every <select> in the app (see selectClass in lib/ui.ts).
                      <select
                        value={filters[c] ?? ""}
                        onChange={(e) => setFilter(c, e.target.value)}
                        aria-label={`Filter ${label(c)}`}
                        className={`${CONTROL} bg-white text-black [color-scheme:light]`}
                      >
                        <option value="">All</option>
                        {column.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                    {column.filter === "search" && (
                      <input
                        type="text"
                        value={filters[c] ?? ""}
                        onChange={(e) => setFilter(c, e.target.value)}
                        aria-label={`Search ${label(c)}`}
                        placeholder="Search"
                        className={`${CONTROL} bg-transparent`}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, r) => (
              <tr
                key={r}
                className="border-b border-black/5 dark:border-white/5 last:border-0 even:bg-black/[0.045] dark:even:bg-white/[0.065]"
              >
                {header.map((_, c) => (
                  <td
                    key={c}
                    className={`${d.pad} align-top break-words [overflow-wrap:anywhere] ${columns[c].numeric ? "text-right tabular-nums" : ""}`}
                  >
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={header.length} className="px-3 py-6 text-center text-black/50 dark:text-white/50">
                  No rows match the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-black/50 dark:text-white/50">
        <span aria-live="polite">
          {filtering ? `Showing ${shown.length.toLocaleString("en-US")} of ` : ""}
          {rows.length.toLocaleString("en-US")} row{rows.length === 1 ? "" : "s"}
        </span>
        {(filtering || sort) && (
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setFilters(header.map(() => ""));
              setSort(null);
            }}
          >
            {filtering && sort ? "Clear filters and sorting" : filtering ? "Clear filters" : "Clear sorting"}
          </button>
        )}
      </div>
    </section>
  );
}
