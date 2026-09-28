import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseScheduleFile } from "@/lib/pickleballSchedule/parseScheduleWorkbook";

// Node has a global File, so the browser-side parser runs here unchanged.

function xlsxFile(build: (wb: XLSX.WorkBook) => void, name = "schedule.xlsx"): File {
  const wb = XLSX.utils.book_new();
  build(wb);
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], name);
}

function rostersAndSchedule(rosterRows: (string | number)[][], scheduleRows: (string | number)[][]) {
  return (wb: XLSX.WorkBook) => {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Group", "Team", "Player 1"], ...rosterRows]),
      "Rosters"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Match #", "Round", "Court", "Group", "Game", "Team 1", "T1 Player 1", "T1 Player 2", "T1 Score", "Team 2"],
        ...scheduleRows,
      ]),
      "Schedule"
    );
  };
}

const BASIC_ROSTERS: (string | number)[][] = [
  ["A", "Smash and Dash", "Murtaza"],
  ["A", "Paddle Muflis", "Aliasgar"],
  ["B", "Warriors", "Husain"],
  ["B", "Patriots", "Hashim"],
];

const BASIC_SCHEDULE: (string | number)[][] = [
  [1, 1, "", "A", 1, "Smash and Dash", "", "", "", "Paddle Muflis"],
  [1, 1, "", "A", 2, "Smash and Dash", "", "", "", "Paddle Muflis"],
  [1, 1, "", "A", 3, "Smash and Dash", "", "", "", "Paddle Muflis"],
  [2, 1, "Court 2", "B", 1, "Warriors", "", "", "", "Patriots"],
  [2, 1, "Court 2", "B", 2, "Warriors", "", "", "", "Patriots"],
];

describe("parseScheduleFile", () => {
  it("reads teams from Rosters and matches (grouped by Match #) from Schedule", async () => {
    const file = xlsxFile(rostersAndSchedule(BASIC_ROSTERS, BASIC_SCHEDULE));
    const parsed = await parseScheduleFile(file);

    expect(parsed.teams).toEqual([
      { name: "Smash and Dash", group: "A" },
      { name: "Paddle Muflis", group: "A" },
      { name: "Warriors", group: "B" },
      { name: "Patriots", group: "B" },
    ]);
    expect(parsed.matches).toEqual([
      { matchNumber: 1, round: "1", court: null, group: "A", team1Name: "Smash and Dash", team2Name: "Paddle Muflis", gamesToPlay: 3 },
      { matchNumber: 2, round: "1", court: "Court 2", group: "B", team1Name: "Warriors", team2Name: "Patriots", gamesToPlay: 2 },
    ]);
  });

  it("dedupes a team name repeated in Rosters", async () => {
    const file = xlsxFile(rostersAndSchedule([...BASIC_ROSTERS, ["A", "Smash and Dash", "Another"]], BASIC_SCHEDULE));
    const parsed = await parseScheduleFile(file);
    expect(parsed.teams.filter((t) => t.name === "Smash and Dash")).toHaveLength(1);
  });

  it("throws when there's no Rosters sheet", async () => {
    const file = xlsxFile((wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Match #"]]), "Schedule");
    });
    await expect(parseScheduleFile(file)).rejects.toThrow(/Rosters/);
  });

  it("throws when there's no Schedule sheet", async () => {
    const file = xlsxFile((wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Group", "Team"], ["A", "X"]]), "Rosters");
    });
    await expect(parseScheduleFile(file)).rejects.toThrow(/Schedule/);
  });

  it("throws when the Schedule sheet is missing a required column", async () => {
    const file = xlsxFile((wb) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Group", "Team"], ["A", "X"]]), "Rosters");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Round", "Group"]]), "Schedule");
    });
    await expect(parseScheduleFile(file)).rejects.toThrow(/Match #/);
  });

  it("throws when Rosters has no team rows", async () => {
    const file = xlsxFile(rostersAndSchedule([], BASIC_SCHEDULE));
    await expect(parseScheduleFile(file)).rejects.toThrow("no teams");
  });

  it("throws when Schedule has no match rows", async () => {
    const file = xlsxFile(rostersAndSchedule(BASIC_ROSTERS, []));
    await expect(parseScheduleFile(file)).rejects.toThrow("no matches");
  });

  it("rejects a non-Excel file", async () => {
    await expect(parseScheduleFile(new File(["a,b"], "schedule.csv"))).rejects.toThrow("Excel");
  });

  it("rejects an empty file", async () => {
    await expect(parseScheduleFile(new File([], "schedule.xlsx"))).rejects.toThrow("empty");
  });
});
