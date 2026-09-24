import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  teamRosterGridRowCount,
  teamRosterGridRows,
  teamRosterGridToCsv,
  teamRosterGridToXlsx,
  teamRosterGridFilename,
  type TeamRosterGrid,
} from "@/lib/teamRosterGrid";

function grid(overrides: Partial<TeamRosterGrid> = {}): TeamRosterGrid {
  return {
    auctionName: "Season Auction",
    tournamentName: "Cup",
    teams: [
      {
        entryId: "e1",
        teamName: "Alpha",
        isMine: true,
        members: [
          { name: "Bob Icon", categoryName: "Icon" },
          { name: "Amy Regular", categoryName: "Regular" },
        ],
      },
      { entryId: "e2", teamName: "Bravo", isMine: false, members: [{ name: "Dan Regular", categoryName: "Regular" }] },
      { entryId: "e3", teamName: "Charlie", isMine: false, members: [] },
    ],
    ...overrides,
  };
}

describe("teamRosterGridRows", () => {
  it("puts team names in the header and one 'name (category)' cell per position", () => {
    expect(teamRosterGridRows(grid())).toEqual([
      ["Alpha", "Bravo", "Charlie"],
      ["Bob Icon (Icon)", "Dan Regular (Regular)", ""],
      ["Amy Regular (Regular)", "", ""],
    ]);
  });

  it("is just the header when nobody has a player, and empty with no teams", () => {
    const empty = grid({ teams: grid().teams.map((t) => ({ ...t, members: [] })) });
    expect(teamRosterGridRows(empty)).toEqual([["Alpha", "Bravo", "Charlie"]]);
    expect(teamRosterGridRowCount(empty)).toBe(0);
    expect(teamRosterGridRowCount(grid({ teams: [] }))).toBe(0);
  });
});

describe("teamRosterGridToCsv", () => {
  it("starts with a UTF-8 BOM and lays out header then rows", () => {
    const csv = teamRosterGridToCsv(grid());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Alpha,Bravo,Charlie",
      "Bob Icon (Icon),Dan Regular (Regular),",
      "Amy Regular (Regular),,",
    ]);
  });

  it("quotes commas and quotes inside names", () => {
    const csv = teamRosterGridToCsv(
      grid({
        teams: [
          {
            entryId: "e1",
            teamName: 'The "A" Team, Ltd',
            isMine: false,
            members: [{ name: "Smith, John", categoryName: "Regular" }],
          },
        ],
      })
    );
    expect(csv.slice(1)).toBe('"The ""A"" Team, Ltd"\r\n"Smith, John (Regular)"');
  });

  it("defuses cells a spreadsheet would run as a formula, and leaves normal ones alone", () => {
    const csv = teamRosterGridToCsv(
      grid({
        teams: [
          {
            entryId: "e1",
            teamName: '=HYPERLINK("http://evil.example","x")',
            isMine: false,
            members: [
              { name: "+1 Player", categoryName: "Regular" },
              { name: "-2 Player", categoryName: "Regular" },
              { name: "@user", categoryName: "Regular" },
              { name: "Amy", categoryName: "Regular" },
            ],
          },
        ],
      })
    );
    const [header, ...rows] = csv.slice(1).split("\r\n");
    expect(header).toBe(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(rows).toEqual(["'+1 Player (Regular)", "'-2 Player (Regular)", "'@user (Regular)", "Amy (Regular)"]);
  });
});

describe("teamRosterGridToXlsx", () => {
  it("writes a 'Team rosters' sheet with the same layout, keeping text exactly as given", () => {
    const evil = '=HYPERLINK("http://evil.example","x")';
    const buffer = teamRosterGridToXlsx(
      grid({
        teams: [
          { entryId: "e1", teamName: evil, isMine: false, members: [{ name: "Bob", categoryName: "Icon" }] },
          { entryId: "e2", teamName: "Bravo", isMine: false, members: [] },
        ],
      })
    );

    // cellStyles: SheetJS only surfaces column widths on read when asked to.
    const workbook = XLSX.read(buffer, { type: "buffer", cellStyles: true });
    expect(workbook.SheetNames).toEqual(["Team rosters"]);
    const sheet = workbook.Sheets["Team rosters"];
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })).toEqual([[evil, "Bravo"], ["Bob (Icon)"]]);
    // A typed string cell, never a formula — so no defusing prefix is needed here.
    expect(sheet["A1"].t).toBe("s");
    expect(sheet["A1"].f).toBeUndefined();
    expect(sheet["!cols"]?.map((c) => c.wch)).toEqual([34, 34]);
  });
});

describe("teamRosterGridFilename", () => {
  it("makes a safe filename from the auction name", () => {
    expect(teamRosterGridFilename(grid({ auctionName: "IPL Auction 2026 / Final!" }), "csv")).toBe(
      "IPL-Auction-2026-Final-team-rosters.csv"
    );
    expect(teamRosterGridFilename(grid(), "xlsx")).toBe("Season-Auction-team-rosters.xlsx");
  });

  it("falls back to a generic name when nothing usable is left", () => {
    expect(teamRosterGridFilename(grid({ auctionName: "///" }), "csv")).toBe("auction-team-rosters.csv");
  });
});
