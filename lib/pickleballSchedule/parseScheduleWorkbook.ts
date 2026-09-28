// Runs in the uploading admin's own BROWSER, never on the server — same
// posture and reasoning as lib/statsUpload/parseWorkbook.ts (SheetJS has
// unpatched advisories with no fix on npm). The service independently
// validates the plain data this produces (lib/pickleballSchedule/schema.ts);
// team names here are resolved to real Team ids in the upload's review
// screen, not trusted as-is.

export type ParsedPickleballTeam = { name: string; group: string };
export type ParsedPickleballMatch = {
  matchNumber: number;
  round: string;
  court: string | null;
  group: string;
  team1Name: string;
  team2Name: string;
  gamesToPlay: number;
};
export type ParsedSchedule = { teams: ParsedPickleballTeam[]; matches: ParsedPickleballMatch[] };

type Xlsx = typeof import("xlsx");
type Row = (string | number | null)[];

const EXCEL_EXT = /\.(xlsx|xlsm|xls)$/i;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function normHeader(cell: unknown): string {
  return String(cell ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findColumn(header: Row, pattern: string): number {
  return header.map(normHeader).indexOf(pattern);
}

function cellText(row: Row | undefined, col: number): string {
  if (!row || col < 0) return "";
  const v = row[col];
  return v === null || v === undefined ? "" : String(v).trim();
}

function sheetRows(XLSX: Xlsx, ws: import("xlsx").WorkSheet): Row[] {
  if (!ws["!ref"]) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, defval: null, raw: false, blankrows: true });
}

function findSheet(wb: import("xlsx").WorkBook, pattern: RegExp): import("xlsx").WorkSheet | null {
  const name = wb.SheetNames.find((n) => pattern.test(n));
  return name ? wb.Sheets[name] : null;
}

/** The first row with any non-blank cell — everything after it is the body. */
function firstHeaderRow(rows: Row[]): { header: Row; bodyStart: number } {
  const i = rows.findIndex((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));
  return { header: rows[i] ?? [], bodyStart: i + 1 };
}

function parseTeams(XLSX: Xlsx, wb: import("xlsx").WorkBook): ParsedPickleballTeam[] {
  const ws = findSheet(wb, /rosters?/i);
  if (!ws) throw new Error('No "Rosters" sheet found — it should list each team\'s Group and Team name.');
  const rows = sheetRows(XLSX, ws);
  const { header, bodyStart } = firstHeaderRow(rows);
  const groupCol = findColumn(header, "group");
  const teamCol = findColumn(header, "team");
  if (groupCol < 0 || teamCol < 0) {
    throw new Error('The "Rosters" sheet needs "Group" and "Team" columns.');
  }

  const teams: ParsedPickleballTeam[] = [];
  const seen = new Set<string>();
  for (let r = bodyStart; r < rows.length; r++) {
    const name = cellText(rows[r], teamCol);
    const group = cellText(rows[r], groupCol);
    if (name === "" || group === "" || seen.has(name)) continue;
    seen.add(name);
    teams.push({ name, group });
  }
  if (teams.length === 0) throw new Error('The "Rosters" sheet has no teams.');
  return teams;
}

function parseMatches(XLSX: Xlsx, wb: import("xlsx").WorkBook): ParsedPickleballMatch[] {
  const ws = findSheet(wb, /schedule/i);
  if (!ws) {
    throw new Error('No "Schedule" sheet found — one row per game, with a Match #, Round, Group, Team 1 and Team 2.');
  }
  const rows = sheetRows(XLSX, ws);
  const { header, bodyStart } = firstHeaderRow(rows);
  const matchCol = findColumn(header, "match");
  const roundCol = findColumn(header, "round");
  const courtCol = findColumn(header, "court");
  const groupCol = findColumn(header, "group");
  const team1Col = findColumn(header, "team 1");
  const team2Col = findColumn(header, "team 2");
  if (matchCol < 0 || roundCol < 0 || groupCol < 0 || team1Col < 0 || team2Col < 0) {
    throw new Error('The "Schedule" sheet needs "Match #", "Round", "Group", "Team 1" and "Team 2" columns.');
  }

  // One row per GAME, same shape as the source workbook — consecutive rows
  // sharing a Match # become one proposed match, its games-to-play the count
  // of rows sharing that number.
  type Draft = { round: string; court: string | null; group: string; team1Name: string; team2Name: string; games: number };
  const byMatch = new Map<number, Draft>();
  const order: number[] = [];
  for (let r = bodyStart; r < rows.length; r++) {
    const matchText = cellText(rows[r], matchCol);
    if (matchText === "") continue;
    const matchNumber = Number(matchText);
    if (!Number.isFinite(matchNumber)) continue;

    const existing = byMatch.get(matchNumber);
    if (existing) {
      existing.games += 1;
      continue;
    }
    const court = cellText(rows[r], courtCol);
    order.push(matchNumber);
    byMatch.set(matchNumber, {
      round: cellText(rows[r], roundCol),
      court: court === "" ? null : court,
      group: cellText(rows[r], groupCol),
      team1Name: cellText(rows[r], team1Col),
      team2Name: cellText(rows[r], team2Col),
      games: 1,
    });
  }
  if (order.length === 0) throw new Error('The "Schedule" sheet has no matches.');

  return order.map((matchNumber) => {
    const m = byMatch.get(matchNumber)!;
    return {
      matchNumber,
      round: m.round,
      court: m.court,
      group: m.group,
      team1Name: m.team1Name,
      team2Name: m.team2Name,
      gamesToPlay: m.games,
    };
  });
}

/**
 * Reads a schedule workbook shaped like the app's own model: a "Rosters"
 * sheet (Group, Team) and a "Schedule" sheet (one row per game — scores are
 * ignored, the admin fills those in later through the scoring console).
 * Throws an Error with a message fit to show the admin for a missing sheet,
 * missing column, or oversized/unsupported file.
 */
export async function parseScheduleFile(file: File): Promise<ParsedSchedule> {
  if (file.size === 0) throw new Error("The file is empty");
  if (file.size > MAX_FILE_BYTES) throw new Error("The file must be 10MB or smaller");
  if (!EXCEL_EXT.test(file.name)) throw new Error("Choose an Excel (.xlsx, .xls) file");

  const mod = await import("xlsx");
  const XLSX: Xlsx = (mod as unknown as { default?: Xlsx }).default ?? mod;
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return { teams: parseTeams(XLSX, wb), matches: parseMatches(XLSX, wb) };
}
