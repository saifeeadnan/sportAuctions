import { describe, it, expect } from "vitest";
import { MY_STATS_LANDING, cleanHiddenColumns, headingsOfSections, inheritSettings, sectionsForSheet, sheetHeadings } from "@/lib/statsPublish";
import type { StatsGrid } from "@/lib/statsUpload/schema";

const career: StatsGrid = [
  ["Player", "Seasons", "Bat inn", "Runs", "Not outs"],
  ["Hashim", "4", "10", "174", "1"],
  ["Adnan Saifee", "5", "14", "151", "3"],
];

const leaders: StatsGrid = [
  ["CAREER - MOST RUNS", null, null],
  ["#", "Player", "Runs", "Matches"],
  ["1", "Hashim", "174", "10"],
  [null, null, null, null],
  ["CAREER - MOST WICKETS", null, null, null],
  ["#", "Player", "Wickets", "Matches"],
  ["1", "Adnan Saifee", "16", "15"],
];

describe("sheetHeadings", () => {
  it("lists a plain sheet's headings in order", () => {
    expect(sheetHeadings(career)).toEqual(["Player", "Seasons", "Bat inn", "Runs", "Not outs"]);
  });

  it("lists each heading of a stacked sheet once, in order of first appearance", () => {
    expect(sheetHeadings(leaders)).toEqual(["#", "Player", "Runs", "Matches", "Wickets"]);
  });

  it("is empty for a sheet with no tables", () => {
    expect(sheetHeadings([["Just a note"]])).toEqual([]);
  });
});

describe("sectionsForSheet", () => {
  it("is just the split sheet when nothing is hidden", () => {
    const [table] = sectionsForSheet(career, []);
    expect(table).toMatchObject({ kind: "table", header: ["Player", "Seasons", "Bat inn", "Runs", "Not outs"] });
  });

  it("removes a hidden column's heading and every one of its cells", () => {
    const [table] = sectionsForSheet(career, ["Bat inn", "Not outs"]);
    expect(table).toEqual({
      kind: "table",
      title: null,
      header: ["Player", "Seasons", "Runs"],
      rows: [["Hashim", "4", "174"], ["Adnan Saifee", "5", "151"]],
    });
  });

  it("matches headings ignoring case and spacing, and ignores headings that are not there", () => {
    const [table] = sectionsForSheet(career, ["  BAT INN ", "No such column"]);
    expect(table.kind === "table" && table.header).toEqual(["Player", "Seasons", "Runs", "Not outs"]);
  });

  it("removes a hidden heading from every table of a stacked sheet", () => {
    const tables = sectionsForSheet(leaders, ["Matches", "#"]).filter((s) => s.kind === "table");
    expect(tables.map((t) => t.kind === "table" && t.header)).toEqual([["Player", "Runs"], ["Player", "Wickets"]]);
    expect(tables.map((t) => t.kind === "table" && t.title)).toEqual(["CAREER - MOST RUNS", "CAREER - MOST WICKETS"]);
  });

  it("drops a table whose every column is hidden, and leaves text alone", () => {
    const sections = sectionsForSheet(
      [["Player", "Runs"], ["Zed", "1"], [null, null], ["A note about the table above"]],
      ["Player", "Runs"]
    );
    expect(sections).toEqual([{ kind: "text", lines: ["A note about the table above"] }]);
  });

  it("does not touch the grid it was given", () => {
    const copy = JSON.stringify(career);
    sectionsForSheet(career, ["Runs"]);
    expect(JSON.stringify(career)).toBe(copy);
  });
});

describe("cleanHiddenColumns", () => {
  it("keeps trimmed, unique, non-blank text only", () => {
    expect(cleanHiddenColumns(["  Runs ", "runs", "", "  ", 5, null, "Wickets"])).toEqual(["Runs", "Wickets"]);
  });

  it("is empty for anything that is not a list, and caps length and count", () => {
    expect(cleanHiddenColumns("Runs")).toEqual([]);
    expect(cleanHiddenColumns(undefined)).toEqual([]);
    expect(cleanHiddenColumns(["x".repeat(500)])[0]).toHaveLength(100);
    expect(cleanHiddenColumns(Array.from({ length: 300 }, (_, i) => `h${i}`))).toHaveLength(200);
  });
});

describe("inheritSettings", () => {
  const previous = {
    landingTab: "Career",
    sheets: [
      { name: "Leaders", position: 0, label: "Top lists", hiddenColumns: ["Matches"] },
      { name: "Career", position: 1, label: null, hiddenColumns: ["Bat inn", "Not outs"] },
      { name: "Notes", position: 2, label: null, hiddenColumns: [] },
    ],
  };

  it("keeps nothing when there is no earlier upload", () => {
    const r = inheritSettings(["A", "B"], null);
    expect(r.order).toEqual(["A", "B"]);
    expect(r.settings.size).toBe(0);
    expect(r.landingTab).toBeNull();
  });

  it("gives each sheet with a matching name its label and hidden columns, ignoring case", () => {
    const r = inheritSettings(["career", "LEADERS", "Brand new"], previous);
    expect(r.settings.get("career")).toEqual({ label: null, hiddenColumns: ["Bat inn", "Not outs"] });
    expect(r.settings.get("leaders")).toEqual({ label: "Top lists", hiddenColumns: ["Matches"] });
    expect(r.settings.has("brand new")).toBe(false);
  });

  it("carries the tab order over only when the fresh file has exactly the same sheets", () => {
    expect(inheritSettings(["Notes", "Career", "Leaders"], previous).order).toEqual(["Leaders", "Career", "Notes"]);
    // a sheet added or removed: keep the workbook's own order
    expect(inheritSettings(["Notes", "Career", "Leaders", "Extra"], previous).order).toEqual(["Notes", "Career", "Leaders", "Extra"]);
    expect(inheritSettings(["Notes", "Career"], previous).order).toEqual(["Notes", "Career"]);
  });

  it("carries the opening tab over when that sheet is still there, and drops it when it is not", () => {
    expect(inheritSettings(["Leaders", "career"], previous).landingTab).toBe("career");
    expect(inheritSettings(["Leaders", "Notes"], previous).landingTab).toBeNull();
    expect(inheritSettings(["Leaders"], { ...previous, landingTab: MY_STATS_LANDING }).landingTab).toBe(MY_STATS_LANDING);
    expect(inheritSettings(["Leaders"], { ...previous, landingTab: null }).landingTab).toBeNull();
  });
});

describe("headingsOfSections", () => {
  it("lists each distinct heading once, in order, across the tables of a sheet, ignoring case", () => {
    const sections = sectionsForSheet(
      [
        ["A", null, null],
        ["Player", "Runs", "Matches"],
        ["Zed", "1", "2"],
        [null, null, null],
        ["B", null, null],
        ["player", "Wickets", "MATCHES"],
        ["Amy", "3", "4"],
      ],
      []
    );
    expect(headingsOfSections(sections)).toEqual(["Player", "Runs", "Matches", "Wickets"]);
  });

  it("skips text sections and blank headings, and is what sheetHeadings is built on", () => {
    expect(headingsOfSections([{ kind: "text", lines: ["a note"] }])).toEqual([]);
    expect(headingsOfSections([{ kind: "table", title: null, header: ["Year", "", "Team"], rows: [["1", "2", "3"]] }])).toEqual(["Year", "Team"]);
    expect(sheetHeadings([["Player", "Runs"], ["Zed", "1"]])).toEqual(["Player", "Runs"]);
  });
});
