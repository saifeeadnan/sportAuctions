import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { assertLeagueNotReadOnly } from "@/lib/services/league.service";
import { ROSTER_FIELD_LABELS, type RosterFieldKey } from "@/lib/rosterTemplates";
import type { Player } from "@/app/generated/prisma/client";

export type ParsedPlayerRow = {
  name: string;
  position?: string;
  age?: number;
  loginId?: string;
  email?: string;
  phone?: string;
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
  email: "email",
  emailid: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  mobile: "phone",
  contact: "phone",
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
  // A trailing " *" (or "*") marks a mandatory column on a downloaded
  // template (see rosterTemplateHeaderRow) — stripped before alias lookup
  // so a filled-in template re-imports without the admin renaming anything.
  const key = header.trim().toLowerCase().replace(/[\s_-]/g, "").replace(/\*+$/, "");
  return HEADER_ALIASES[key] ?? null;
}

function rowsFromRecords(
  records: Record<string, unknown>[],
  mandatoryFields: RosterFieldKey[] = []
): ParseResult {
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

    // A field that's both league-mandatory and numerically invalid (caught
    // above) produces two errors for the same row — harmless, both are
    // legitimate and the row is correctly skipped either way.
    const missing = mandatoryFields.filter((field) => mapped[field] == null);
    if (missing.length > 0) {
      for (const field of missing) {
        errors.push({ rowNumber, message: `Missing required field: ${ROSTER_FIELD_LABELS[field]}` });
      }
      return;
    }

    validRows.push(mapped as ParsedPlayerRow);
  });

  return { validRows, errors };
}

export function parseRosterFile(
  buffer: Buffer,
  filename: string,
  mandatoryFields: RosterFieldKey[] = []
): ParseResult {
  // Excel import intentionally isn't supported: the `xlsx` (SheetJS) parser
  // has unpatched prototype-pollution and ReDoS advisories with no fix
  // available on npm, and this function runs it directly against
  // user-uploaded bytes. CSV via PapaParse doesn't carry that risk.
  if (!/\.csv$/i.test(filename)) {
    throw new ValidationError("Only CSV files are supported for roster import — export your sheet as .csv and try again");
  }

  const parsed = Papa.parse<Record<string, unknown>>(buffer.toString("utf-8"), {
    header: true,
    skipEmptyLines: true,
  });
  return rowsFromRecords(parsed.data, mandatoryFields);
}

export async function createRosterFromUpload(
  name: string,
  rows: ParsedPlayerRow[],
  createdById: string,
  leagueId: string
) {
  if (!name.trim()) {
    throw new ValidationError("Roster name is required");
  }
  if (rows.length === 0) {
    throw new ValidationError("No valid player rows to import");
  }

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) throw new ValidationError("League not found");
  assertLeagueNotReadOnly(league);

  return prisma.$transaction(async (tx) => {
    const roster = await tx.playerRoster.create({
      data: { name: name.trim(), createdById, leagueId },
    });

    await tx.player.createMany({
      data: rows.map((row) => ({
        rosterId: roster.id,
        name: row.name,
        position: row.position,
        age: row.age,
        loginId: row.loginId,
        email: row.email,
        phone: row.phone,
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
  email?: string;
  phone?: string;
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
  const roster = await prisma.playerRoster.findUnique({
    where: { id: rosterId },
    include: { league: true },
  });
  if (!roster) {
    throw new ValidationError("Roster not found");
  }
  assertLeagueNotReadOnly(roster.league);

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

// Header names deliberately match `HEADER_ALIASES` above (once spaces are
// stripped/lowercased), so a file exported here re-imports cleanly through
// `parseRosterFile`. `field` is `null` for the always-required Name column
// (never eligible to be marked mandatory — it already always is).
export const ROSTER_EXPORT_COLUMNS: {
  header: string;
  field: RosterFieldKey | null;
  get: (p: Player) => string | number;
}[] = [
  { header: "Name", field: null, get: (p) => p.name },
  { header: "Position", field: "position", get: (p) => p.position ?? "" },
  { header: "Age", field: "age", get: (p) => p.age ?? "" },
  { header: "Login ID", field: "loginId", get: (p) => p.loginId ?? "" },
  { header: "Email", field: "email", get: (p) => p.email ?? "" },
  { header: "Phone", field: "phone", get: (p) => p.phone ?? "" },
  { header: "Default Category", field: "defaultCategory", get: (p) => p.defaultCategory ?? "" },
  { header: "Previous Team", field: "previousTeam", get: (p) => p.previousTeam ?? "" },
  { header: "Photo URL", field: "photoUrl", get: (p) => p.photoUrl ?? "" },
  { header: "Rating", field: "rating", get: (p) => (p.rating != null ? Number(p.rating) : "") },
  {
    header: "Batting Rating",
    field: "battingRating",
    get: (p) => (p.battingRating != null ? Number(p.battingRating) : ""),
  },
  {
    header: "Bowling Rating",
    field: "bowlingRating",
    get: (p) => (p.bowlingRating != null ? Number(p.bowlingRating) : ""),
  },
  {
    header: "Fielding Rating",
    field: "fieldingRating",
    get: (p) => (p.fieldingRating != null ? Number(p.fieldingRating) : ""),
  },
];

export function rosterExportRows(players: Player[]): (string | number)[][] {
  return players.map((p) => ROSTER_EXPORT_COLUMNS.map((col) => col.get(p)));
}

// A blank starting file for a league's roster upload — same headers as
// export (so it round-trips through parseRosterFile unchanged) with " *"
// appended to any header the league currently requires.
export function rosterTemplateHeaderRow(mandatoryFields: RosterFieldKey[]): string[] {
  return ROSTER_EXPORT_COLUMNS.map((col) =>
    col.field && mandatoryFields.includes(col.field) ? `${col.header} *` : col.header
  );
}

export async function renameRoster(rosterId: string, name: string) {
  if (!name.trim()) {
    throw new ValidationError("Roster name is required");
  }
  const roster = await prisma.playerRoster.findUnique({ where: { id: rosterId } });
  if (!roster) {
    throw new ValidationError("Roster not found");
  }

  return prisma.playerRoster.update({
    where: { id: rosterId },
    data: { name: name.trim() },
  });
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
