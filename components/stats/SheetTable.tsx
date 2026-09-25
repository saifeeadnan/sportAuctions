"use client";

import { useMemo, useState } from "react";
import { card } from "@/lib/ui";
import { classifyColumns, columnWidths, splitOnMatch, viewRows, visibleColumns, type SortState } from "@/lib/statsTableView";

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

/** Text with whatever matches the sheet's find box picked out. */
export function Highlighted({ text, find }: { text: string; find: string }) {
  if (find.trim() === "") return <>{text}</>;
  return (
    <>
      {splitOnMatch(text, find).map((part, i) =>
        part.hit ? (
          <mark key={i} className="rounded-sm bg-amber-300/70 dark:bg-amber-400/40 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

const CONTROL =
  "mt-1 block w-full min-w-0 rounded border border-black/15 dark:border-white/15 px-1 py-0.5 text-[11px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500/50";

const NO_HIDDEN: ReadonlySet<string> = new Set();

/**
 * One table of a sheet. Every column sorts: click a header (ascending,
 * descending, back to sheet order). The columns you pick rows by — names,
 * teams, years, results — also filter: a dropdown where a column repeats a few
 * values, a search box for names; measures such as runs get no filter. Filters
 * combine. Alternate rows are shaded, following the order on screen rather than
 * the order in the file.
 *
 * Columns the visitor has hidden (by heading) are simply not drawn. Sorting and
 * filters are remembered against the table's own columns, so hiding and showing
 * columns never loses them; a sort or filter on a hidden column pauses until it
 * is shown again, and the remaining columns share the width (and get larger type).
 */
export function SheetTable({
  title,
  header,
  rows,
  scrollBody,
  find = "",
  hidden = NO_HIDDEN,
}: {
  title: string | null;
  header: string[];
  rows: string[][];
  /** What is typed in the sheet's find box: only rows containing it are shown, with it picked out. */
  find?: string;
  /** Headings the visitor has hidden, as normHeading writes them. */
  hidden?: ReadonlySet<string>;
  /** A sheet that is a single table scrolls vertically inside its card with a
   * sticky header; one of several tables just flows down the page. */
  scrollBody: boolean;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<string[]>(() => header.map(() => ""));

  const columns = useMemo(() => classifyColumns(rows, header.length), [rows, header.length]);
  const visible = useMemo(() => visibleColumns(header, hidden), [header, hidden]);
  const showing = useMemo(() => new Set(visible), [visible]);
  const d = density(visible.length);
  const widths = useMemo(
    () =>
      columnWidths(
        visible.map((c) => header[c]),
        rows.map((row) => visible.map((c) => row[c] ?? "")),
        visible.map((c) => columns[c]),
        { charPx: d.charPx, padPx: d.padPx }
      ),
    [visible, header, rows, columns, d.charPx, d.padPx]
  );

  // a sort or filter on a column that is hidden waits until it is shown again
  const activeSort = sort && showing.has(sort.column) ? sort : null;
  const activeFilters = useMemo(() => filters.map((f, c) => (showing.has(c) ? f : "")), [filters, showing]);
  const shown = useMemo(
    () => viewRows(rows, columns, activeFilters, activeSort, find, visible),
    [rows, columns, activeFilters, activeSort, find, visible]
  );
  const filteringColumns = columns.some((col, c) => col.filter !== "none" && (activeFilters[c] ?? "").trim() !== "");
  const filtering = find.trim() !== "" || filteringColumns;

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
      {visible.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">Every column of this table is hidden — choose some under Columns.</p>
      ) : (
        <div className={`${card} overflow-x-hidden ${scrollBody ? "max-h-[75vh] overflow-y-auto" : ""}`}>
          <table className={`w-full table-fixed border-collapse ${d.text}`}>
            <colgroup>
              {widths.map((w, v) => (
                <col key={visible[v]} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {visible.map((c) => {
                  const sorted = activeSort?.column === c ? activeSort.direction : null;
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
                  {visible.map((c) => (
                    <td
                      key={c}
                      className={`${d.pad} align-top break-words [overflow-wrap:anywhere] ${columns[c].numeric ? "text-right tabular-nums" : ""}`}
                    >
                      <Highlighted text={row[c] ?? ""} find={find} />
                    </td>
                  ))}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={visible.length} className="px-3 py-6 text-center text-black/50 dark:text-white/50">
                    No rows match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-black/50 dark:text-white/50">
        <span aria-live="polite">
          {filtering ? `Showing ${shown.length.toLocaleString("en-US")} of ` : ""}
          {rows.length.toLocaleString("en-US")} row{rows.length === 1 ? "" : "s"}
          {visible.length < header.length ? ` · ${visible.length} of ${header.length} columns` : ""}
        </span>
        {(filteringColumns || activeSort) && (
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setFilters(header.map(() => ""));
              setSort(null);
            }}
          >
            {filteringColumns && activeSort ? "Clear filters and sorting" : filteringColumns ? "Clear filters" : "Clear sorting"}
          </button>
        )}
      </div>
    </section>
  );
}
