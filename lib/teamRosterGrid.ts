import * as XLSX from "xlsx";
import Papa from "papaparse";

export type TeamRosterGrid = {
  auctionName: string;
  tournamentName: string;
  leagueName: string;
  /** One entry per team, in column order. */
  teams: {
    entryId: string;
    teamName: string;
    /** True for the team the requesting user manages — never for an admin. */
    isMine: boolean;
    /** Already in display order: highest-priced category first, then name. */
    members: { name: string; categoryName: string }[];
  }[];
};

export function teamRosterGridRowCount(grid: TeamRosterGrid): number {
  return Math.max(0, ...grid.teams.map((t) => t.members.length));
}

/** Header row of team names, then one row per roster position — a team with
 * fewer players than the biggest one just has blank cells at the bottom. */
export function teamRosterGridRows(grid: TeamRosterGrid): string[][] {
  const header = grid.teams.map((t) => t.teamName);
  const body = Array.from({ length: teamRosterGridRowCount(grid) }, (_, i) =>
    grid.teams.map((t) => {
      const m = t.members[i];
      return m ? `${m.name} (${m.categoryName})` : "";
    })
  );
  return [header, ...body];
}

// A spreadsheet treats a cell starting with one of these as a formula. Team
// names are editable by their own manager and this file gets opened by other
// people, so a name like =HYPERLINK(...) must not run on their machine. The
// leading apostrophe is the standard defusing prefix (and stays visible in a
// plain-text CSV viewer, which is the honest trade-off).
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function neutralizeFormula(cell: string): string {
  return FORMULA_TRIGGER.test(cell) ? `'${cell}` : cell;
}

/** UTF-8 with a BOM so Excel opens accented names correctly. */
export function teamRosterGridToCsv(grid: TeamRosterGrid): string {
  const rows = teamRosterGridRows(grid).map((row) => row.map(neutralizeFormula));
  return `﻿${Papa.unparse(rows)}`;
}

/** Cells are written as typed strings, which Excel never evaluates as
 * formulas, so unlike the CSV there's nothing to defuse here. Blanks are
 * written as truly empty cells (null), not empty-text ones, so the sheet
 * doesn't look like it has data where it doesn't. */
export function teamRosterGridToXlsx(grid: TeamRosterGrid): Buffer {
  const rows = teamRosterGridRows(grid).map((row) => row.map((cell) => (cell === "" ? null : cell)));
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = grid.teams.map(() => ({ wch: 34 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Team rosters");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function teamRosterGridFilename(grid: TeamRosterGrid, extension: "csv" | "xlsx"): string {
  const base = grid.auctionName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "auction";
  return `${base}-team-rosters.${extension}`;
}
