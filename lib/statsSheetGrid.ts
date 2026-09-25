import type { StatsCell, StatsGrid } from "@/lib/statsUpload/schema";

// Presentation helpers for an uploaded sheet grid. Pure, so the public page,
// the admin view and the tests all agree on what a "table" looks like.

export function isBlankCell(cell: StatsCell | undefined): boolean {
  return cell === null || cell === undefined || (typeof cell === "string" && cell.trim() === "");
}

/** The smallest rows × columns rectangle (from the top-left) that holds every
 * non-blank cell of ANY of the given grids. */
export function gridExtent(...grids: StatsGrid[]): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const grid of grids) {
    grid.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (isBlankCell(cell)) return;
        rows = Math.max(rows, r + 1);
        cols = Math.max(cols, c + 1);
      });
    });
  }
  return { rows, cols };
}

/** Crops (or pads with blanks) to exactly rows × cols, so every row has the same width. */
export function cropGrid(grid: StatsGrid, rows: number, cols: number): StatsGrid {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cell = grid[r]?.[c];
      return cell === undefined ? null : cell;
    })
  );
}

const NUMERIC_TEXT = /^\(?[-+−]?[$€£]?(\d[\d,]*(\.\d+)?|\.\d+)(e[-+]?\d+)?%?\)?$/i;

/** Whether displayed text should be right-aligned and sorted as a number. */
export function looksNumeric(text: string): boolean {
  return NUMERIC_TEXT.test(text.trim());
}

// ---------------------------------------------------------------------------
// Splitting a sheet into tables
// ---------------------------------------------------------------------------

/** One piece of a sheet: a table with a header row (sortable and filterable),
 * or plain text (a heading, a note, a page of prose). */
export type SheetSection =
  | { kind: "table"; title: string | null; header: string[]; rows: string[][] }
  | { kind: "text"; lines: string[] };

type Box = { r0: number; r1: number; c0: number; c1: number };

const text = (cell: StatsCell | undefined): string => (cell === null || cell === undefined ? "" : String(cell));

/** Maximal runs of `true`, as inclusive [start, end] index pairs (offset applied). */
function runs(flags: boolean[], offset: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  flags.forEach((on, i) => {
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([start + offset, i - 1 + offset]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start + offset, flags.length - 1 + offset]);
  return out;
}

/**
 * Cuts a region along fully blank rows and fully blank columns until no cut is
 * left — the way Excel finds a "current region". A stacked leaderboard sheet
 * falls apart into its blocks; two tables side by side (with a blank column
 * between) become two regions.
 */
function partition(grid: StatsGrid, box: Box): Box[] {
  const rowFlags: boolean[] = [];
  for (let r = box.r0; r <= box.r1; r++) {
    let any = false;
    for (let c = box.c0; c <= box.c1 && !any; c++) any = !isBlankCell(grid[r]?.[c]);
    rowFlags.push(any);
  }
  const rowRuns = runs(rowFlags, box.r0);
  if (rowRuns.length === 0) return [];
  if (rowRuns.length > 1 || rowRuns[0][0] !== box.r0 || rowRuns[0][1] !== box.r1) {
    return rowRuns.flatMap(([r0, r1]) => partition(grid, { ...box, r0, r1 }));
  }

  const colFlags: boolean[] = [];
  for (let c = box.c0; c <= box.c1; c++) {
    let any = false;
    for (let r = box.r0; r <= box.r1 && !any; r++) any = !isBlankCell(grid[r]?.[c]);
    colFlags.push(any);
  }
  const colRuns = runs(colFlags, box.c0);
  if (colRuns.length > 1 || colRuns[0][0] !== box.c0 || colRuns[0][1] !== box.c1) {
    return colRuns.flatMap(([c0, c1]) => partition(grid, { ...box, c0, c1 }));
  }
  return [box];
}

function classify(grid: StatsGrid, box: Box): SheetSection {
  const rows: string[][] = [];
  for (let r = box.r0; r <= box.r1; r++) {
    const row: string[] = [];
    for (let c = box.c0; c <= box.c1; c++) row.push(text(grid[r]?.[c]));
    rows.push(row);
  }
  const width = box.c1 - box.c0 + 1;
  const filled = (row: string[]) => row.filter((cell) => cell.trim() !== "");

  // A lone text cell above a row of two or more is the block's title.
  let title: string | null = null;
  let body = rows;
  if (body.length >= 3 && filled(body[0]).length === 1 && filled(body[1]).length >= 2) {
    title = filled(body[0])[0];
    body = body.slice(1);
  }
  if (width >= 2 && body.length >= 2) {
    return { kind: "table", title, header: body[0], rows: body.slice(1) };
  }
  return { kind: "text", lines: rows.map((row) => filled(row).join("   ")).filter((line) => line !== "") };
}

/**
 * Splits a sheet's display grid into its tables and text blocks, in reading
 * order. A plain sheet is one table; a stacked leaderboard sheet is many; a
 * page of notes is text. Every table's first row is its header, which is what
 * lets each one be sorted and filtered on its own.
 */
export function splitSheet(grid: StatsGrid): SheetSection[] {
  const width = grid.reduce((w, row) => Math.max(w, row.length), 0);
  if (grid.length === 0 || width === 0) return [];
  return partition(grid, { r0: 0, r1: grid.length - 1, c0: 0, c1: width - 1 }).map((box) => classify(grid, box));
}
