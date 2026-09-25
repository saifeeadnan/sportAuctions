import { describe, it, expect } from "vitest";
import { cropGrid, gridExtent, isBlankCell, looksNumeric, splitSheet } from "@/lib/statsSheetGrid";

describe("gridExtent / cropGrid", () => {
  it("finds the smallest top-left rectangle holding every non-blank cell of any grid", () => {
    const display = [["a", null, null], [null, null, null], [null, null, null]];
    const values = [[null, null, null], [null, null, null], [null, 5, null]];
    expect(gridExtent(display, values)).toEqual({ rows: 3, cols: 2 });
    expect(gridExtent([[null]])).toEqual({ rows: 0, cols: 0 });
  });

  it("treats whitespace-only text as blank", () => {
    expect(isBlankCell("  ")).toBe(true);
    expect(isBlankCell("0")).toBe(false);
    expect(isBlankCell(0)).toBe(false);
    expect(gridExtent([["  ", null]])).toEqual({ rows: 0, cols: 0 });
  });

  it("crops and pads with blanks so every row is the same width", () => {
    expect(cropGrid([["a", "b", "c"], ["d"]], 2, 2)).toEqual([["a", "b"], ["d", null]]);
    expect(cropGrid([["a"]], 2, 3)).toEqual([["a", null, null], [null, null, null]]);
  });
});

describe("looksNumeric", () => {
  it("recognises the numbers Excel displays", () => {
    for (const t of ["12", "-3", "1,234", "43.861", "0.5", ".5", "12%", "$1,200.50", "(4.5)", "1.2E+05", " 7 "]) {
      expect(looksNumeric(t), t).toBe(true);
    }
  });

  it("does not treat words, ids or dates as numbers", () => {
    for (const t of ["", "Hashim", "Team 2", "2026-09-24", "12 wickets", "N/A"]) {
      expect(looksNumeric(t), t).toBe(false);
    }
  });
});

describe("splitSheet", () => {
  it("is one table for a plain sheet, with the first row as its header", () => {
    const sections = splitSheet([["Player", "Runs"], ["Hashim", "174"], ["Saifee", "90"]]);
    expect(sections).toEqual([
      { kind: "table", title: null, header: ["Player", "Runs"], rows: [["Hashim", "174"], ["Saifee", "90"]] },
    ]);
  });

  it("splits a stacked leaderboard sheet into one titled table per block", () => {
    const sections = splitSheet([
      ["Career runs", null, null],
      ["Player", "Runs", "Avg"],
      ["Hashim", "174", "12"],
      ["Saifee", "90", "9"],
      [null, null, null],
      ["Career wickets", null, null],
      ["Player", "Wkts", null],
      ["Pindi", "19", null],
    ]);
    expect(sections).toEqual([
      { kind: "table", title: "Career runs", header: ["Player", "Runs", "Avg"], rows: [["Hashim", "174", "12"], ["Saifee", "90", "9"]] },
      // the second block is narrower: its blank third column is not part of it
      { kind: "table", title: "Career wickets", header: ["Player", "Wkts"], rows: [["Pindi", "19"]] },
    ]);
  });

  it("separates tables placed side by side (a blank column between) and a note under one of them", () => {
    const sections = splitSheet([
      ["Year", "Winner", null, "Setting", "Value"],
      ["2022", "Team B", null, "Champion", "1.25"],
      ["2023", "BCC-H", null, "Runner-up", "1.1"],
      ["2024", "Stallions", null, null, null],
      ["2025", "Knights", null, "Edit these to recalculate", null],
    ]);
    expect(sections.map((s) => s.kind)).toEqual(["table", "table", "text"]);
    expect(sections[0]).toMatchObject({ header: ["Year", "Winner"] });
    expect(sections[0].kind === "table" && sections[0].rows).toHaveLength(4);
    expect(sections[1]).toMatchObject({ header: ["Setting", "Value"], rows: [["Champion", "1.25"], ["Runner-up", "1.1"]] });
    expect(sections[2]).toEqual({ kind: "text", lines: ["Edit these to recalculate"] });
  });

  it("keeps a table whole when one of its cells is blank, but splits at a fully blank row", () => {
    const sections = splitSheet([
      ["Name", "Team", "Note"],
      ["Hashim", "Titans", null],
      ["Saifee", null, "captain"],
      [null, null, null],
      ["NOT merged: Yusuf N | Yusuf Kapadia", null, null],
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ kind: "table", header: ["Name", "Team", "Note"] });
    expect(sections[0].kind === "table" && sections[0].rows).toEqual([["Hashim", "Titans", ""], ["Saifee", "", "captain"]]);
    expect(sections[1]).toEqual({ kind: "text", lines: ["NOT merged: Yusuf N | Yusuf Kapadia"] });
  });

  it("shows prose (one column, or lone cells) as text, not a table", () => {
    expect(splitSheet([["First line"], ["Second line"], [null], ["Third line"]])).toEqual([
      { kind: "text", lines: ["First line", "Second line"] },
      { kind: "text", lines: ["Third line"] },
    ]);
    expect(splitSheet([["Heading", null, null]])).toEqual([{ kind: "text", lines: ["Heading"] }]);
  });

  it("does not take a two-row block whose first row has several cells for a titled table", () => {
    expect(splitSheet([["A", "B"], ["1", "2"]])).toEqual([
      { kind: "table", title: null, header: ["A", "B"], rows: [["1", "2"]] },
    ]);
  });

  it("gives back nothing for an empty grid", () => {
    expect(splitSheet([])).toEqual([]);
    expect(splitSheet([[null, null], [null, null]])).toEqual([]);
  });

  it("finds every table of a many-block sheet in reading order", () => {
    const grid = [
      ["A", null, null],
      ["h1", "h2", "h3"],
      ["1", "2", "3"],
      [null, null, null],
      ["B", null, null],
      ["h1", "h2", "h3"],
      ["4", "5", "6"],
      [null, null, null],
      ["C", null, null],
      ["h1", "h2", "h3"],
      ["7", "8", "9"],
    ];
    expect(splitSheet(grid).map((s) => s.kind === "table" && s.title)).toEqual(["A", "B", "C"]);
  });
});
