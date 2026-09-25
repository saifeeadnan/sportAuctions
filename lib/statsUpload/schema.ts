import { ValidationError } from "@/lib/errors";

// Pure and browser-safe: the upload form runs it for instant feedback and the
// service re-runs it, because the server must never trust what a client says
// it parsed. No zod here — nothing else in the app uses it, and a sheet-by-
// sheet hand check lets every message name the sheet and row at fault.

export type StatsCell = string | number | null;
export type StatsGrid = StatsCell[][];

export type StatsSheetInput = { name: string; display: StatsGrid; values: StatsGrid };
export type ValidatedStatsSheet = StatsSheetInput & { rowCount: number; columnCount: number };

export const STATS_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxSheets: 25,
  maxRowsPerSheet: 2_000,
  maxColumnsPerSheet: 100,
  maxTotalCells: 100_000,
  maxCellChars: 2_000,
  maxSheetNameChars: 100,
  maxLabelChars: 80,
} as const;

function checkGrid(sheetName: string, part: "display" | "values", grid: unknown): StatsGrid {
  const where = `Sheet "${sheetName}"`;
  if (!Array.isArray(grid)) throw new ValidationError(`${where} has no ${part} data`);
  grid.forEach((row, r) => {
    if (!Array.isArray(row)) throw new ValidationError(`${where}: row ${r + 1} is not a list of cells`);
    row.forEach((cell, c) => {
      if (cell === null) return;
      if (typeof cell === "number") {
        if (!Number.isFinite(cell)) throw new ValidationError(`${where}: row ${r + 1}, column ${c + 1} is not a finite number`);
        return;
      }
      if (typeof cell === "string") {
        if (cell.length > STATS_LIMITS.maxCellChars) {
          throw new ValidationError(
            `${where}: row ${r + 1}, column ${c + 1} has more than ${STATS_LIMITS.maxCellChars} characters`
          );
        }
        return;
      }
      throw new ValidationError(`${where}: row ${r + 1}, column ${c + 1} must be text, a number or blank`);
    });
  });
  return grid as StatsGrid;
}

/**
 * Validates the sheets an admin chose to load: a shape check (grids of text /
 * number / blank, every row the same width, display and values the same size)
 * plus the caps that keep a public page renderable. Returns the sheets with
 * trimmed names and their dimensions; throws ValidationError otherwise.
 */
export function validateStatsSheets(input: unknown): ValidatedStatsSheet[] {
  if (!Array.isArray(input) || input.length === 0) throw new ValidationError("Choose at least one sheet to load");
  if (input.length > STATS_LIMITS.maxSheets) {
    throw new ValidationError(`A file can load at most ${STATS_LIMITS.maxSheets} sheets`);
  }

  const seen = new Set<string>();
  let totalCells = 0;
  const out: ValidatedStatsSheet[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) throw new ValidationError("A sheet is malformed");
    const { name: rawName, display: rawDisplay, values: rawValues } = raw as Record<string, unknown>;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) throw new ValidationError("Every sheet needs a name");
    if (name.length > STATS_LIMITS.maxSheetNameChars) {
      throw new ValidationError(`Sheet name "${name.slice(0, 30)}…" is longer than ${STATS_LIMITS.maxSheetNameChars} characters`);
    }
    const key = name.toLowerCase();
    if (seen.has(key)) throw new ValidationError(`Two sheets are both named "${name}"`);
    seen.add(key);

    const display = checkGrid(name, "display", rawDisplay);
    const values = checkGrid(name, "values", rawValues);
    const rowCount = display.length;
    const columnCount = display[0]?.length ?? 0;
    if (rowCount === 0 || columnCount === 0) throw new ValidationError(`Sheet "${name}" is empty`);
    if (rowCount > STATS_LIMITS.maxRowsPerSheet) {
      throw new ValidationError(
        `Sheet "${name}" has ${rowCount.toLocaleString("en-US")} rows; the limit is ${STATS_LIMITS.maxRowsPerSheet.toLocaleString("en-US")}`
      );
    }
    if (columnCount > STATS_LIMITS.maxColumnsPerSheet) {
      throw new ValidationError(`Sheet "${name}" has ${columnCount} columns; the limit is ${STATS_LIMITS.maxColumnsPerSheet}`);
    }
    if (values.length !== rowCount) throw new ValidationError(`Sheet "${name}": display and values have different sizes`);
    for (let r = 0; r < rowCount; r++) {
      if (display[r].length !== columnCount || values[r].length !== columnCount) {
        throw new ValidationError(`Sheet "${name}": row ${r + 1} is not ${columnCount} cells wide`);
      }
    }

    totalCells += rowCount * columnCount;
    if (totalCells > STATS_LIMITS.maxTotalCells) {
      throw new ValidationError(
        `The chosen sheets hold more than ${STATS_LIMITS.maxTotalCells.toLocaleString("en-US")} cells — untick some sheets`
      );
    }
    out.push({ name, display, values, rowCount, columnCount });
  }
  return out;
}
