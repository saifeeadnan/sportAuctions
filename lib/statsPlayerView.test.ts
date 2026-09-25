import { describe, it, expect } from "vitest";
import { buildPlayerIndex, findPlayers, groupSections, isCompactSection, isNameHeading, playerStats } from "@/lib/statsPlayerView";
import type { StatsGrid } from "@/lib/statsUpload/schema";

// A small workbook shaped like the real one: a per-person table, a per-season
// table, a stacked leaderboard sheet, and a sheet with no people in it.
const career: StatsGrid = [
  ["Player", "Seasons", "Runs", "Wickets"],
  ["Hashim", "4", "174", "3"],
  ["Adnan Saifee", "5", "151", "16"],
  ["Abdul Qadir Lashkarwala", "4", "124", "10"],
];

const seasons: StatsGrid = [
  ["Year", "Player", "Team", "Runs", "Result"],
  ["2025", "Hashim", "Titans", "90", "Champion"],
  ["2025", "Adnan Saifee", "Knights", "60", ""],
  ["2026", "Hashim", "Stallions", "84", ""],
  ["2026", "Adnan Saifee", "Knights", "91", ""],
  ["2026", "Abdul Qadir Lashkarwala", "Stallions", "70", ""],
];

const leaders: StatsGrid = [
  ["CAREER - MOST RUNS", null, null],
  ["#", "Player", "Runs"],
  ["1", "Hashim", "174"],
  ["2", "Adnan Saifee", "151"],
  [null, null, null],
  ["CAREER - MOST WICKETS", null, null],
  ["#", "Player", "Wickets"],
  ["1", "Adnan Saifee", "16"],
];

const teams: StatsGrid = [
  ["Year", "Team", "Wins"],
  ["2026", "Stallions", "3"],
  ["2026", "Titans", "1"],
];

const sheets = [
  { name: "Career", display: career },
  { name: "Season detail", display: seasons },
  { name: "Leaders", display: leaders },
  { name: "Team results", display: teams },
];

describe("isNameHeading", () => {
  it("recognises the headings that hold a person", () => {
    for (const h of ["Player", "Name", "Player Name", "Player (as shown)", "player"]) expect(isNameHeading(h), h).toBe(true);
  });

  it("does not take a team, file, id or alias column for a person", () => {
    for (const h of ["Team", "Team Name", "Names in the files", "Player ids", "Tournament id", "Runs", "Year", ""]) expect(isNameHeading(h), h).toBe(false);
  });
});

describe("buildPlayerIndex", () => {
  const index = buildPlayerIndex(sheets);

  it("finds every table with a name column, including each block of a stacked sheet, and skips the rest", () => {
    expect(index.tables.map((t) => [t.sheet, t.title])).toEqual([
      ["Career", null],
      ["Season detail", null],
      ["Leaders", "CAREER - MOST RUNS"],
      ["Leaders", "CAREER - MOST WICKETS"],
    ]);
  });

  it("collects each distinct name once, sorted", () => {
    expect(index.names).toEqual(["Abdul Qadir Lashkarwala", "Adnan Saifee", "Hashim"]);
  });

  it("treats a name written differently in case or spacing as the same person", () => {
    const messy = buildPlayerIndex([{ name: "A", display: [["Player", "Runs"], ["Hashim", "1"], ["  hashim ", "2"], ["HASHIM", "3"]] }]);
    expect(messy.names).toEqual(["Hashim"]);
  });

  it("ignores blank and numeric cells in the name column", () => {
    const odd = buildPlayerIndex([{ name: "A", display: [["Player", "Runs"], ["Hashim", "1"], ["", "2"], ["17", "3"], ["12,345", "4"]] }]);
    expect(odd.names).toEqual(["Hashim"]);
  });

  it("uses the first name-like column when a table has several", () => {
    const two = buildPlayerIndex([{ name: "Name mapping", display: [["Player (as shown)", "Names in the files", "Player ids"], ["Aijaz Abbas", "Abdul Husain Abbas | Aijaz Abbas", "1 | 2"], ["Zed", "Zed", "3"]] }]);
    expect(two.names).toEqual(["Aijaz Abbas", "Zed"]);
    expect(two.tables[0].nameCol).toBe(0);
  });

  it("has no names when no sheet has a name column", () => {
    expect(buildPlayerIndex([{ name: "Team results", display: teams }]).names).toEqual([]);
    expect(buildPlayerIndex([]).tables).toEqual([]);
  });
});

describe("findPlayers", () => {
  const index = buildPlayerIndex(sheets);

  it("returns nothing for an empty box", () => {
    expect(findPlayers(index, "")).toEqual([]);
    expect(findPlayers(index, "   ")).toEqual([]);
  });

  it("matches part of a name, ignoring case", () => {
    expect(findPlayers(index, "hash")).toEqual(["Hashim"]);
    expect(findPlayers(index, "SAIF")).toEqual(["Adnan Saifee"]);
  });

  it("matches words in any order", () => {
    expect(findPlayers(index, "qadir abdul")).toEqual(["Abdul Qadir Lashkarwala"]);
    expect(findPlayers(index, "saifee adnan")).toEqual(["Adnan Saifee"]);
  });

  it("ranks an exact name first, then names that start with it, then names with a word that does", () => {
    const idx = buildPlayerIndex([{ name: "A", display: [["Player", "Runs"], ["Ali Khan", "1"], ["Ali", "2"], ["Khalid Ali", "3"], ["Maliha", "4"]] }]);
    expect(findPlayers(idx, "ali")).toEqual(["Ali", "Ali Khan", "Khalid Ali", "Maliha"]);
  });

  it("returns nothing when no name has every word, and respects a limit", () => {
    expect(findPlayers(index, "zzz")).toEqual([]);
    expect(findPlayers(index, "hashim adnan")).toEqual([]);
    expect(findPlayers(index, "a", 2)).toHaveLength(2);
  });
});

describe("playerStats", () => {
  const index = buildPlayerIndex(sheets);

  it("gives a person's single row in a per-person table as a Value column, one field per column", () => {
    const [career] = playerStats(index, "Hashim");
    expect(career).toEqual({
      sheet: "Career",
      title: null,
      columns: ["Value"],
      fields: [
        { label: "Seasons", values: ["4"] },
        { label: "Runs", values: ["174"] },
        { label: "Wickets", values: ["3"] },
      ],
    });
  });

  it("turns a per-season table into a column per season, headed by year and team", () => {
    const section = playerStats(index, "Hashim").find((s) => s.sheet === "Season detail")!;
    expect(section.columns).toEqual(["2025 · Titans", "2026 · Stallions"]);
    // the year and team are in the headings, and the name is not repeated; Result is blank in one season only, so it stays
    expect(section.fields).toEqual([
      { label: "Runs", values: ["90", "84"] },
      { label: "Result", values: ["Champion", ""] },
    ]);
  });

  it("leaves out a field that is blank in all of a person's rows", () => {
    const section = playerStats(index, "Adnan Saifee").find((s) => s.sheet === "Season detail")!;
    expect(section.fields.map((f) => f.label)).toEqual(["Runs"]); // Result is blank for both of his seasons
  });

  it("includes each block of a stacked sheet where the person appears, with its title", () => {
    expect(playerStats(index, "Hashim").filter((s) => s.sheet === "Leaders").map((s) => s.title)).toEqual(["CAREER - MOST RUNS"]);
    const saifee = playerStats(index, "Adnan Saifee").filter((s) => s.sheet === "Leaders");
    expect(saifee.map((s) => s.title)).toEqual(["CAREER - MOST RUNS", "CAREER - MOST WICKETS"]);
    // a lone row keeps every field but the name, including the rank
    expect(saifee[1].fields).toEqual([{ label: "#", values: ["1"] }, { label: "Wickets", values: ["16"] }]);
  });

  it("returns the sections in workbook order and skips tables the person is not in", () => {
    expect(playerStats(index, "Abdul Qadir Lashkarwala").map((s) => s.sheet)).toEqual(["Career", "Season detail"]);
  });

  it("matches the name however it is cased or spaced, and finds nobody who is not there", () => {
    expect(playerStats(index, "  hashim ").length).toBe(playerStats(index, "Hashim").length);
    expect(playerStats(index, "Nobody")).toEqual([]);
    expect(playerStats(index, "")).toEqual([]);
  });

  it("numbers the columns when a person's rows can't be told apart, and keeps duplicate headings distinct", () => {
    const plain = buildPlayerIndex([{ name: "A", display: [["Player", "Score"], ["Zed", "1"], ["Zed", "2"], ["Other", "3"]] }]);
    expect(playerStats(plain, "Zed")[0].columns).toEqual(["Row 1", "Row 2"]);
    const twins = buildPlayerIndex([{ name: "A", display: [["Player", "Year", "Score"], ["Zed", "2026", "1"], ["Zed", "2026", "2"], ["Other", "2025", "3"], ["Other", "2025", "4"]] }]);
    expect(playerStats(twins, "Zed")[0].columns).toEqual(["2026", "2026 (2)"]);
  });
});

describe("groupSections", () => {
  const section = (columns: string[]) => ({ sheet: "S", title: null, columns, fields: [{ label: "x", values: columns.map(() => "1") }] });

  it("gathers each run of narrow sections into one group, keeping the order, and leaves wide ones alone", () => {
    const a = section(["Value"]);
    const b = section(["Value"]);
    const wide = section(["2022", "2023", "2024", "2025"]);
    const c = section(["Value"]);
    const d = section(["2025", "2026"]);
    expect(groupSections([a, b, wide, c, d])).toEqual([
      { compact: true, sections: [a, b] },
      { compact: false, sections: [wide] },
      { compact: true, sections: [c, d] },
    ]);
  });

  it("treats up to three value columns as narrow, and four as wide", () => {
    expect(isCompactSection(section(["a", "b", "c"]))).toBe(true);
    expect(isCompactSection(section(["a", "b", "c", "d"]))).toBe(false);
  });

  it("is empty for no sections", () => {
    expect(groupSections([])).toEqual([]);
  });
});
