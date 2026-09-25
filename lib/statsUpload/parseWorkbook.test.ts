import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseStatsFile } from "@/lib/statsUpload/parseWorkbook";
import { validateStatsSheets } from "@/lib/statsUpload/schema";

// Node has a global File, so the browser-side parser runs here unchanged.

function xlsxFile(build: (wb: XLSX.WorkBook) => void, name = "stats.xlsx"): File {
  const wb = XLSX.utils.book_new();
  build(wb);
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer;
  return new File([bytes], name);
}

const num = (v: number, z?: string): XLSX.CellObject => ({ t: "n", v, ...(z ? { z } : {}) });

describe("parseStatsFile — Excel", () => {
  it("returns every sheet in workbook order with both grids", async () => {
    const file = xlsxFile((wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Player", "Runs"], ["Hashim", 174]]), "Career");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Year"], [2026]]), "Seasons");
    });
    const { sheets } = await parseStatsFile(file);
    expect(sheets.map((s) => s.name)).toEqual(["Career", "Seasons"]);
    expect(sheets[0].display).toEqual([["Player", "Runs"], ["Hashim", "174"]]);
    expect(sheets[0].values).toEqual([["Player", "Runs"], ["Hashim", 174]]);
    expect([sheets[0].rowCount, sheets[0].columnCount, sheets[0].problem]).toEqual([2, 2, null]);
  });

  it("shows numbers as Excel formats them but keeps the raw value", async () => {
    const file = xlsxFile((wb) => {
      const ws = XLSX.utils.aoa_to_sheet([[num(43.861000000000004, "0.000"), num(0.256, "0.0%"), num(1.25, "0.00")]]);
      XLSX.utils.book_append_sheet(wb, ws, "Fmt");
    });
    const [sheet] = (await parseStatsFile(file)).sheets;
    expect(sheet.display[0]).toEqual(["43.861", "25.6%", "1.25"]);
    expect(sheet.values[0]).toEqual([43.861000000000004, 0.256, 1.25]);
  });

  it("uses the cached result of a formula", async () => {
    const file = xlsxFile((wb) => {
      const ws = XLSX.utils.aoa_to_sheet([[2, 3, { t: "n", v: 5, f: "A1+B1" } as XLSX.CellObject]]);
      XLSX.utils.book_append_sheet(wb, ws, "F");
    });
    const [sheet] = (await parseStatsFile(file)).sheets;
    expect(sheet.values[0]).toEqual([2, 3, 5]);
    expect(sheet.display[0][2]).toBe("5");
  });

  it("keeps the stacked layout of a leaderboard sheet: title rows, blank rows, ragged widths", async () => {
    const file = xlsxFile((wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ["Career runs", null, null],
        ["Player", "Runs", "Avg"],
        ["Hashim", 174, 12],
        [null, null, null],
        ["Career wickets", null, null],
        ["Player", "Wkts", null],
        ["Pindi", 19, null],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Leaders");
    });
    const [sheet] = (await parseStatsFile(file)).sheets;
    expect([sheet.rowCount, sheet.columnCount]).toEqual([7, 3]);
    expect(sheet.display[3]).toEqual([null, null, null]);
    expect(sheet.display[6]).toEqual(["Pindi", "19", null]);
    // both grids are rectangular, so the server's validator accepts them
    expect(() => validateStatsSheets([{ name: "Leaders", display: sheet.display, values: sheet.values }])).not.toThrow();
  });

  it("crops leading and trailing empty space to the used area", async () => {
    const file = xlsxFile((wb) => {
      const ws = XLSX.utils.aoa_to_sheet([["a", null, null, null], [null, null, null, null], [null, null, null, null]]);
      ws["!ref"] = "A1:D10";
      XLSX.utils.book_append_sheet(wb, ws, "Crop");
    });
    const [sheet] = (await parseStatsFile(file)).sheets;
    expect([sheet.rowCount, sheet.columnCount]).toEqual([1, 1]);
  });

  it("reads dates as calendar days, booleans as TRUE/FALSE and formula errors as their text", async () => {
    const file = xlsxFile((wb) => {
      const ws = XLSX.utils.aoa_to_sheet([
        [{ t: "d", v: new Date(2026, 8, 24) } as XLSX.CellObject, { t: "b", v: true } as XLSX.CellObject, { t: "e", v: 42, w: "#N/A" } as XLSX.CellObject],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Mixed");
    });
    const [sheet] = (await parseStatsFile(file)).sheets;
    expect(sheet.values[0][0]).toBe("2026-09-24");
    expect(sheet.values[0][1]).toBe("TRUE");
    expect(sheet.display[0][2]).toBe("#N/A");
  });

  it("flags hidden sheets and problem sheets without dropping them", async () => {
    const file = xlsxFile((wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["a"]]), "Visible");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["b"]]), "Working");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Empty");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Array.from({ length: 2001 }, (_, i) => [i])), "TooTall");
      wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }, { Hidden: 0 }, { Hidden: 0 }] };
    });
    const { sheets } = await parseStatsFile(file);
    expect(sheets.map((s) => [s.name, s.hidden, s.problem])).toEqual([
      ["Visible", false, null],
      ["Working", true, null],
      ["Empty", false, "Empty sheet"],
      ["TooTall", false, expect.stringMatching(/2,001 rows/)],
    ]);
  });

  it("rejects an empty file, an oversized file and an unsupported type with a readable message", async () => {
    await expect(parseStatsFile(new File([], "a.xlsx"))).rejects.toThrow(/empty/i);
    await expect(parseStatsFile(new File(["x"], "a.docx"))).rejects.toThrow(/Excel .* or CSV/);
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.xlsx");
    await expect(parseStatsFile(big)).rejects.toThrow(/10MB/);
  });
});

describe("parseStatsFile — CSV", () => {
  it("is a workbook of one sheet named after the file, with numbers in values and text in display", async () => {
    const csv = "Player,Runs,Note\nHashim,174,\"top, scorer\"\nSaifee,90,\n";
    const { sheets } = await parseStatsFile(new File([csv], "Career Stats.csv"));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Career Stats");
    expect(sheets[0].display[1]).toEqual(["Hashim", "174", "top, scorer"]);
    expect(sheets[0].values[1]).toEqual(["Hashim", 174, "top, scorer"]);
    expect(sheets[0].display[2]).toEqual(["Saifee", "90", null]);
    expect([sheets[0].rowCount, sheets[0].columnCount]).toEqual([3, 3]);
  });

  it("drops a leading byte-order mark and trailing blank lines", async () => {
    const { sheets } = await parseStatsFile(new File(["﻿a,b\n1,2\n\n\n"], "x.csv"));
    expect(sheets[0].display).toEqual([["a", "b"], ["1", "2"]]);
  });
});
