import Papa from "papaparse";
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
  // Excel import intentionally isn't supported: the `xlsx` (SheetJS) parser
  // has unpatched prototype-pollution and ReDoS advisories with no fix
  // available on npm, and this function runs it directly against
  // user-uploaded bytes. CSV via PapaParse doesn't carry that risk.
  if (!/\.csv$/i.test(filename)) {
    throw new ValidationError("Only CSV files are supported for points import — export your sheet as .csv and try again");
  }

  const parsed = Papa.parse<Record<string, unknown>>(buffer.toString("utf-8"), {
    header: true,
    skipEmptyLines: true,
  });
  return rowsFromRecords(parsed.data);
}

// Applying parsed rows to an auction lives in fantasyPointsUpload.service.ts,
// which records every upload as a versioned snapshot.
