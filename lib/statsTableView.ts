import { looksNumeric } from "@/lib/statsSheetGrid";

// Sorting, filtering and column sizing for one displayed table. Pure and
// browser-safe: it works on the text Excel showed ("1,234", "12.5%"), which is
// all the public page ever receives, so it parses numbers back out of it.

export type SortState = { column: number; direction: "asc" | "desc" } | null;

const blank = (cell: string) => cell.trim() === "";

/** "1,234" → 1234, "12.5%" → 12.5, "(4.5)" → -4.5, "$3" → 3; null when the text isn't a number. */
export function parseNumber(text: string): number | null {
  const t = text.trim();
  if (!looksNumeric(t)) return null;
  const parenthesised = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[()$€£,%\s]/g, "").replace("−", "-"));
  if (!Number.isFinite(n)) return null;
  return parenthesised ? -Math.abs(n) : n;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Blank cells always sort last, whichever way the column is sorted; numbers come before text. */
export function compareCells(a: string, b: string, direction: "asc" | "desc"): number {
  const aBlank = blank(a);
  const bBlank = blank(b);
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
  const sign = direction === "asc" ? 1 : -1;
  const an = parseNumber(a);
  const bn = parseNumber(b);
  if (an !== null && bn !== null) return (an - bn) * sign;
  if (an !== null) return -1;
  if (bn !== null) return 1;
  return collator.compare(a, b) * sign;
}

// ---------------------------------------------------------------------------
// Which columns get a filter, and what kind
// ---------------------------------------------------------------------------

/**
 * How a column can be filtered. Every column can be sorted, but a filter only
 * makes sense on the columns people pick rows by — names, teams, years,
 * results — never on a measure such as runs or an average.
 * - "select": a dropdown of the column's values (a team, a year, a result)
 * - "search": a text box matching anywhere in the cell (a player's name)
 * - "none":   no filter (numbers you would sort by, not filter by)
 */
export type FilterKind = "select" | "search" | "none";

export type ColumnInfo = {
  /** Mostly numbers — right-aligned. Years count as numbers here. */
  numeric: boolean;
  filter: FilterKind;
  /** The dropdown's choices, for "select" only. */
  options: string[];
  /** Characters of room the filter control needs to be readable (0 when there is none). */
  controlChars: number;
};

const YEAR = /^(19|20)\d{2}$/;
/** A text column offers a dropdown only while it repeats a handful of short values. */
const MAX_OPTIONS = 25;
const MAX_OPTION_LENGTH = 40;
/** "Repeats" means at least a fifth of the values are repeats; a column of all-different names is searched instead. */
const REPEAT_RATIO = 0.8;

/** A dropdown shows its longest choice plus an arrow — capped, since the open list shows the full names; a search box shows its "Search" hint. */
const selectChars = (options: string[]) => Math.min(12, options.reduce((m, o) => Math.max(m, o.length), 3) + 3);
const SEARCH_CHARS = 7;

export function classifyColumns(rows: string[][], width: number): ColumnInfo[] {
  return Array.from({ length: width }, (_, c) => {
    const filled = rows.map((row) => (row[c] ?? "").trim()).filter((cell) => cell !== "");
    if (filled.length === 0) return { numeric: false, filter: "none" as const, options: [], controlChars: 0 };

    const numeric = filled.filter((cell) => looksNumeric(cell)).length / filled.length >= 0.8;
    const years = filled.filter((cell) => YEAR.test(cell)).length / filled.length >= 0.8;
    const distinct = [...new Set(filled)].sort((a, b) => collator.compare(a, b));

    // A year is a number that names a season rather than measuring anything.
    if (years) return { numeric, filter: "select" as const, options: distinct, controlChars: selectChars(distinct) };
    if (numeric) return { numeric, filter: "none" as const, options: [], controlChars: 0 };

    // Text: a dropdown while values repeat (teams, results), a search box otherwise (names).
    const listLike = filled.some((cell) => /[,;]/.test(cell));
    const repeats =
      distinct.length <= MAX_OPTIONS &&
      distinct.length <= filled.length * REPEAT_RATIO &&
      distinct.every((cell) => cell.length <= MAX_OPTION_LENGTH);
    return !listLike && repeats
      ? { numeric, filter: "select" as const, options: distinct, controlChars: selectChars(distinct) }
      : { numeric, filter: "search" as const, options: [], controlChars: SEARCH_CHARS };
  });
}

/** Whether a cell passes what was chosen or typed under its column. An empty value passes everything. */
export function cellPasses(filter: FilterKind, value: string, cell: string): boolean {
  const wanted = value.trim().toLowerCase();
  if (filter === "none" || wanted === "") return true;
  const shown = cell.trim().toLowerCase();
  return filter === "select" ? shown === wanted : shown.includes(wanted);
}

/** The rows to show: those passing every column's filter, in the chosen order (ties keep their sheet order). */
export function viewRows(rows: string[][], columns: ColumnInfo[], filters: string[], sort: SortState): string[][] {
  const kept = rows.filter((row) => columns.every((col, c) => cellPasses(col.filter, filters[c] ?? "", row[c] ?? "")));
  if (!sort) return kept;
  const { column, direction } = sort;
  return kept
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareCells(a.row[column] ?? "", b.row[column] ?? "", direction) || a.index - b.index)
    .map(({ row }) => row);
}

/** How much room text takes at a given density: estimated pixels per character, and the cell padding both sides. */
export type Density = { charPx: number; padPx: number };

/** The container width the column shares are worked out for; a wider one just scales them up. */
const REFERENCE_WIDTH = 1200;
/** How many characters of a heading's longest word a column will ask room for. */
const HEADING_CHARS = 9;

/**
 * Column widths as percentages summing to 100, for a fixed-layout table that
 * always fills its container — so it fits exactly and text wraps inside its
 * column instead of the table growing a scrollbar.
 *
 * Each column asks for the room its longest cell needs. When they all fit with
 * room to spare, the table still fills its width, but names, teams and years
 * stay about as wide as their text and all the spare room goes to the measure
 * columns (runs, averages), shared equally, so their headings don't wrap. When
 * together they ask for more than fits, the text columns give way first — they
 * can wrap onto more lines — while the measure columns keep their width so no
 * figure is split across two lines. A heading asks for room for its longest
 * word (up to 9 characters) and wraps or clips beyond that, and it is the
 * first to give way when space is short; the filter control under it is given
 * room to be read.
 */
export function columnWidths(
  header: string[],
  rows: string[][],
  columns: Pick<ColumnInfo, "numeric" | "controlChars">[],
  density: Density
): number[] {
  const cols = header.map((label, c) => {
    const { numeric, controlChars } = columns[c];
    const longest = rows.reduce((m, row) => Math.max(m, (row[c] ?? "").length), 0);
    // the room the values want, or the filter control under the heading needs, whichever is more
    const content = Math.max(2, Math.min(longest, numeric ? 16 : 24), controlChars);
    // the heading's longest word asks for room too, but only so far (a longer one clips)...
    const heading = Math.min(label.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0), HEADING_CHARS);
    const px = density.padPx + density.charPx * Math.max(content, heading);
    // ...and it is the first thing to give way: a number (or year) keeps the width of its values,
    // text can shrink to about 8 characters
    const floor = density.padPx + density.charPx * (numeric ? content : Math.min(content, 8));
    // a measure is a number column with no filter control; a year has a dropdown, so it is not one
    return { px, floor, numeric, measure: numeric && controlChars === 0 };
  });
  const asked = cols.reduce((s, col) => s + col.px, 0);

  let sized: number[];
  if (asked >= REFERENCE_WIDTH) {
    const slack = cols.reduce((s, col) => s + (col.px - col.floor), 0);
    const cut = slack > 0 ? Math.min(asked - REFERENCE_WIDTH, slack) : 0;
    sized = cols.map((col) => (cut > 0 ? col.px - (cut * (col.px - col.floor)) / slack : col.px));
  } else {
    // the measures take the spare room; a table with none shares it among every column
    const receivers = cols.some((col) => col.measure) ? cols.filter((col) => col.measure) : cols;
    const extra = (REFERENCE_WIDTH - asked) / receivers.length;
    sized = cols.map((col) => (receivers.includes(col) ? col.px + extra : col.px));
  }
  const total = sized.reduce((s, px) => s + px, 0);
  return sized.map((px) => (px / total) * 100);
}
