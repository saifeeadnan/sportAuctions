import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type ParsedPlayerRow = {
  name: string;
  position?: string;
  age?: number;
  loginId?: string;
  defaultCategory?: string;
  previousTeam?: string;
  photoUrl?: string;
  rating?: number;
  battingRating?: number;
  bowlingRating?: number;
  fieldingRating?: number;
};

export type RowError = {
  rowNumber: number;
  message: string;
};

export type ParseResult = {
  validRows: ParsedPlayerRow[];
  errors: RowError[];
};

const HEADER_ALIASES: Record<string, keyof ParsedPlayerRow> = {
  name: "name",
  playername: "name",
  player: "name",
  position: "position",
  role: "position",
  age: "age",
  loginid: "loginId",
  login: "loginId",
  contact: "loginId",
  phone: "loginId",
  email: "loginId",
  defaultcategory: "defaultCategory",
  category: "defaultCategory",
  previousteam: "previousTeam",
  prevteam: "previousTeam",
  formerteam: "previousTeam",
  photourl: "photoUrl",
  photo: "photoUrl",
  image: "photoUrl",
  imageurl: "photoUrl",
  rating: "rating",
  score: "rating",
  batting: "battingRating",
  battingrating: "battingRating",
  bowling: "bowlingRating",
  bowlingrating: "bowlingRating",
  fielding: "fieldingRating",
  fieldingrating: "fieldingRating",
};

type NumericField = "age" | "rating" | "battingRating" | "bowlingRating" | "fieldingRating";
const NUMERIC_FIELDS = new Set<NumericField>([
  "age",
  "rating",
  "battingRating",
  "bowlingRating",
  "fieldingRating",
]);

function isNumericField(field: keyof ParsedPlayerRow): field is NumericField {
  return NUMERIC_FIELDS.has(field as NumericField);
}

function normalizeHeader(header: string): keyof ParsedPlayerRow | null {
  const key = header.trim().toLowerCase().replace(/[\s_-]/g, "");
  return HEADER_ALIASES[key] ?? null;
}

function rowsFromRecords(records: Record<string, unknown>[]): ParseResult {
  const validRows: ParsedPlayerRow[] = [];
  const errors: RowError[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2; // header is row 1
    const mapped: Partial<ParsedPlayerRow> = {};

    for (const [rawHeader, value] of Object.entries(record)) {
      const field = normalizeHeader(rawHeader);
      if (!field || value === undefined || value === null || value === "") continue;

      if (isNumericField(field)) {
        const num = Number(value);
        if (Number.isNaN(num)) {
          errors.push({
            rowNumber,
            message: `Invalid ${field} value "${value}" — must be a number`,
          });
          continue;
        }
        mapped[field] = num;
      } else {
        mapped[field] = String(value).trim();
      }
    }

    if (!mapped.name) {
      errors.push({ rowNumber, message: "Missing required field: name" });
      return;
    }

    validRows.push(mapped as ParsedPlayerRow);
  });

  return { validRows, errors };
}

export function parseRosterFile(buffer: Buffer, filename: string): ParseResult {
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

export async function createRosterFromUpload(
  name: string,
  rows: ParsedPlayerRow[],
  createdById: string
) {
  if (!name.trim()) {
    throw new ValidationError("Roster name is required");
  }
  if (rows.length === 0) {
    throw new ValidationError("No valid player rows to import");
  }

  return prisma.$transaction(async (tx) => {
    const roster = await tx.playerRoster.create({
      data: { name: name.trim(), createdById },
    });

    await tx.player.createMany({
      data: rows.map((row) => ({
        rosterId: roster.id,
        name: row.name,
        position: row.position,
        age: row.age,
        loginId: row.loginId,
        defaultCategory: row.defaultCategory,
        previousTeam: row.previousTeam,
        photoUrl: row.photoUrl,
        rating: row.rating,
        battingRating: row.battingRating,
        bowlingRating: row.bowlingRating,
        fieldingRating: row.fieldingRating,
      })),
    });

    return roster;
  });
}

export type PlayerInput = {
  name: string;
  position?: string;
  age?: number;
  loginId?: string;
  defaultCategory?: string;
  previousTeam?: string;
  photoUrl?: string;
  rating?: number;
  battingRating?: number;
  bowlingRating?: number;
  fieldingRating?: number;
};

export async function createPlayer(rosterId: string, input: PlayerInput) {
  if (!input.name.trim()) {
    throw new ValidationError("Player name is required");
  }
  const roster = await prisma.playerRoster.findUnique({ where: { id: rosterId } });
  if (!roster) {
    throw new ValidationError("Roster not found");
  }

  return prisma.player.create({
    data: { ...input, rosterId, name: input.name.trim() },
  });
}

export async function updatePlayer(playerId: string, input: PlayerInput) {
  if (!input.name.trim()) {
    throw new ValidationError("Player name is required");
  }
  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) {
    throw new ValidationError("Player not found");
  }

  return prisma.player.update({
    where: { id: playerId },
    data: { ...input, name: input.name.trim() },
  });
}

export async function deletePlayer(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { _count: { select: { auctionPlayers: true } } },
  });
  if (!player) {
    throw new ValidationError("Player not found");
  }
  if (player._count.auctionPlayers > 0) {
    throw new ValidationError(
      `Cannot delete "${player.name}" — already used in ${player._count.auctionPlayers} auction(s).`
    );
  }

  await prisma.player.delete({ where: { id: playerId } });
}

export async function deleteRoster(rosterId: string) {
  const roster = await prisma.playerRoster.findUnique({
    where: { id: rosterId },
    include: { _count: { select: { tournaments: true } } },
  });
  if (!roster) {
    throw new ValidationError("Roster not found");
  }
  if (roster._count.tournaments > 0) {
    throw new ValidationError(
      `Cannot delete "${roster.name}" — it is used by ${roster._count.tournaments} tournament(s). Delete those tournaments first.`
    );
  }

  await prisma.playerRoster.delete({ where: { id: rosterId } });
}
