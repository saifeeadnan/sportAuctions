import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

export type ParsedPlayerRow = {
  name: string;
  position?: string;
  age?: number;
  contact?: string;
  photoUrl?: string;
  rating?: number;
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
  contact: "contact",
  phone: "contact",
  email: "contact",
  photourl: "photoUrl",
  photo: "photoUrl",
  image: "photoUrl",
  imageurl: "photoUrl",
  rating: "rating",
  score: "rating",
};

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

      if (field === "age" || field === "rating") {
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
        contact: row.contact,
        photoUrl: row.photoUrl,
        rating: row.rating,
      })),
    });

    return roster;
  });
}
