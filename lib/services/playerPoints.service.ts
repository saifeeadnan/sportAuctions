import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type ParsedPointsRow = {
  name?: string;
  loginId?: string;
  points: number;
};

export type RowError = {
  rowNumber: number;
  message: string;
};

export type ParsePointsResult = {
  validRows: ParsedPointsRow[];
  errors: RowError[];
};

type Field = "name" | "loginId" | "points";

const HEADER_ALIASES: Record<string, Field> = {
  name: "name",
  playername: "name",
  player: "name",
  loginid: "loginId",
  login: "loginId",
  points: "points",
  point: "points",
  score: "points",
  pts: "points",
};

function normalizeHeader(header: string): Field | null {
  const key = header.trim().toLowerCase().replace(/[\s_-]/g, "");
  return HEADER_ALIASES[key] ?? null;
}

function rowsFromRecords(records: Record<string, unknown>[]): ParsePointsResult {
  const validRows: ParsedPointsRow[] = [];
  const errors: RowError[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2; // header is row 1
    const mapped: Partial<Record<Field, string>> = {};

    for (const [rawHeader, value] of Object.entries(record)) {
      const field = normalizeHeader(rawHeader);
      if (!field || value === undefined || value === null || value === "") continue;
      mapped[field] = String(value).trim();
    }

    if (!mapped.name && !mapped.loginId) {
      errors.push({ rowNumber, message: "Missing player name or login ID" });
      return;
    }
    if (!mapped.points) {
      errors.push({ rowNumber, message: "Missing points value" });
      return;
    }
    const points = Number(mapped.points);
    if (Number.isNaN(points)) {
      errors.push({ rowNumber, message: `Invalid points value "${mapped.points}" — must be a number` });
      return;
    }

    validRows.push({ name: mapped.name, loginId: mapped.loginId, points });
  });

  return { validRows, errors };
}

export function parsePointsFile(buffer: Buffer, filename: string): ParsePointsResult {
  const isExcel = /\.xlsx?$/i.test(filename);

  if (isExcel) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new ValidationError("Workbook has no sheets");
    }
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[firstSheet]
    );
    return rowsFromRecords(records);
  }

  const parsed = Papa.parse<Record<string, unknown>>(buffer.toString("utf-8"), {
    header: true,
    skipEmptyLines: true,
  });
  return rowsFromRecords(parsed.data);
}

/** Matches each row to a player in this auction's pool (by login ID first,
 * falling back to name, both case-insensitive) and writes their points.
 * Rows that don't match anyone are reported but don't block the rest. */
export async function applyPointsToAuction(auctionId: string, rows: ParsedPointsRow[]) {
  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId },
    include: { player: true },
  });

  const byLoginId = new Map<string, (typeof auctionPlayers)[number]>();
  const byName = new Map<string, (typeof auctionPlayers)[number]>();
  for (const ap of auctionPlayers) {
    if (ap.player.loginId) byLoginId.set(ap.player.loginId.toLowerCase(), ap);
    byName.set(ap.player.name.toLowerCase(), ap);
  }

  const updates: { auctionPlayerId: string; points: number }[] = [];
  const unmatched: RowError[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const match =
      (row.loginId && byLoginId.get(row.loginId.toLowerCase())) ||
      (row.name && byName.get(row.name.toLowerCase()));
    if (!match) {
      unmatched.push({
        rowNumber,
        message: `No player found in this auction matching "${row.loginId || row.name}"`,
      });
      return;
    }
    updates.push({ auctionPlayerId: match.id, points: row.points });
  });

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.auctionPlayer.update({
          where: { id: u.auctionPlayerId },
          data: { points: u.points },
        })
      )
    );
  }

  return { updatedCount: updates.length, unmatched };
}
