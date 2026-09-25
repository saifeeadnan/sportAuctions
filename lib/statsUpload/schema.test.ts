import { describe, it, expect } from "vitest";
import { ValidationError } from "@/lib/errors";
import { STATS_LIMITS, validateStatsSheets, type StatsGrid } from "@/lib/statsUpload/schema";

const grid = (rows: number, cols: number, fill: string | number | null = "x"): StatsGrid =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));

const sheet = (name: string, rows = 2, cols = 2) => ({ name, display: grid(rows, cols), values: grid(rows, cols) });

describe("validateStatsSheets", () => {
  it("accepts well-formed sheets and returns trimmed names with their dimensions", () => {
    const out = validateStatsSheets([sheet("  Career  ", 3, 4), sheet("Leaders", 5, 2)]);
    expect(out.map((s) => [s.name, s.rowCount, s.columnCount])).toEqual([
      ["Career", 3, 4],
      ["Leaders", 5, 2],
    ]);
  });

  it("accepts blank, numeric and text cells, in display and values independently", () => {
    const out = validateStatsSheets([
      { name: "A", display: [["1.50", null, "x"]], values: [[1.5, null, "x"]] },
    ]);
    expect(out[0].values[0]).toEqual([1.5, null, "x"]);
  });

  it("requires at least one sheet, and no more than the maximum", () => {
    expect(() => validateStatsSheets([])).toThrow(/at least one sheet/i);
    expect(() => validateStatsSheets("nope")).toThrow(ValidationError);
    const many = Array.from({ length: STATS_LIMITS.maxSheets + 1 }, (_, i) => sheet(`S${i}`));
    expect(() => validateStatsSheets(many)).toThrow(/at most/i);
  });

  it("rejects blank names, over-long names and names that differ only by case", () => {
    expect(() => validateStatsSheets([sheet("   ")])).toThrow(/needs a name/i);
    expect(() => validateStatsSheets([sheet("x".repeat(STATS_LIMITS.maxSheetNameChars + 1))])).toThrow(/longer than/i);
    expect(() => validateStatsSheets([sheet("Career"), sheet("career")])).toThrow(/both named/i);
  });

  it("rejects an empty sheet, naming it", () => {
    expect(() => validateStatsSheets([{ name: "Blank", display: [], values: [] }])).toThrow(/"Blank" is empty/);
    expect(() => validateStatsSheets([{ name: "Blank", display: [[]], values: [[]] }])).toThrow(/"Blank" is empty/);
  });

  it("rejects ragged rows and a display/values size mismatch", () => {
    expect(() =>
      validateStatsSheets([{ name: "R", display: [["a", "b"], ["c"]], values: [["a", "b"], ["c"]] }])
    ).toThrow(/row 2 is not 2 cells wide/);
    expect(() => validateStatsSheets([{ name: "M", display: grid(2, 2), values: grid(3, 2) }])).toThrow(/different sizes/);
    expect(() => validateStatsSheets([{ name: "M", display: grid(2, 2), values: [["a", "b"], ["c"]] }])).toThrow(/not 2 cells wide/);
  });

  it("rejects cells that are not text, a finite number or blank", () => {
    const bad = (cell: unknown) => validateStatsSheets([{ name: "B", display: [[cell]], values: [[cell]] }]);
    expect(() => bad(true)).toThrow(/text, a number or blank/);
    expect(() => bad({ v: 1 })).toThrow(/text, a number or blank/);
    expect(() => bad(undefined)).toThrow(/text, a number or blank/);
    expect(() => bad(Infinity)).toThrow(/finite number/);
    expect(() => bad(NaN)).toThrow(/finite number/);
    expect(() => bad("x".repeat(STATS_LIMITS.maxCellChars + 1))).toThrow(/more than 2000 characters/);
  });

  it("enforces the row, column and total-cell caps", () => {
    expect(() => validateStatsSheets([sheet("Tall", STATS_LIMITS.maxRowsPerSheet + 1, 1)])).toThrow(/limit is 2,000/);
    expect(() => validateStatsSheets([sheet("Wide", 1, STATS_LIMITS.maxColumnsPerSheet + 1)])).toThrow(/limit is 100/);
    // 3 sheets of 2,000 x 20 = 120,000 cells > 100,000
    expect(() =>
      validateStatsSheets([sheet("A", 2000, 20), sheet("B", 2000, 20), sheet("C", 2000, 20)])
    ).toThrow(/more than 100,000 cells/);
    expect(() => validateStatsSheets([sheet("A", 2000, 20), sheet("B", 2000, 20)])).not.toThrow();
  });
});
