import { randomBytes } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import { STATS_LIMITS, validateStatsSheets, type StatsGrid } from "@/lib/statsUpload/schema";

// Same reasoning as fantasyPointsUpload: the interactive-transaction default of
// 5 s is too short for a few thousand cells of JSON against a remote Postgres.
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };
const UPLOAD_ORDER = [{ uploadedAt: "desc" }, { id: "desc" }] as const satisfies Prisma.TournamentStatsUploadOrderByWithRelationInput[];

// Tournament statistics are retrospective records, published well after a
// league's end date, so none of this is gated on league read-only status —
// the same call FantasyPointsUpload makes for final points.

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export type UploadTournamentStatsInput = {
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  /** The sheets the admin ticked, as the browser parsed them — validated
   * here, never trusted. */
  sheets: unknown;
  label?: string | null;
};

/**
 * Stores an uploaded workbook: the original bytes untouched (for the admin's
 * re-download) plus one grid pair per chosen sheet. The bytes are never
 * parsed here — see lib/statsUpload/parseWorkbook.ts for why.
 */
export async function uploadTournamentStats(
  leagueId: string,
  input: UploadTournamentStatsInput,
  actorUserId: string
): Promise<{ id: string; sheetCount: number }> {
  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true } });
  if (!league) throw new ValidationError("League not found");

  if (input.fileBytes.length === 0) throw new ValidationError("File is empty");
  if (input.fileBytes.length > STATS_LIMITS.maxFileBytes) throw new ValidationError("File must be 10MB or smaller");
  const fileName = input.fileName.trim().slice(0, 255);
  if (!fileName) throw new ValidationError("The file has no name");
  const mimeType = input.mimeType.trim().slice(0, 200) || "application/octet-stream";

  const sheets = validateStatsSheets(input.sheets);
  const label = input.label?.trim().slice(0, STATS_LIMITS.maxLabelChars) || null;

  // Prisma's Bytes wants a plain-ArrayBuffer Uint8Array, not a Node Buffer
  // (see tournamentDocument.service.ts).
  const fileData = new Uint8Array(input.fileBytes);

  const created = await prisma.$transaction(async (tx) => {
    const upload = await tx.tournamentStatsUpload.create({
      data: {
        leagueId,
        uploadedById: actorUserId,
        label,
        fileName,
        mimeType,
        fileData,
        sheets: {
          create: sheets.map((s, position) => ({
            position,
            name: s.name,
            display: s.display as Prisma.InputJsonValue,
            values: s.values as Prisma.InputJsonValue,
            rowCount: s.rowCount,
            columnCount: s.columnCount,
          })),
        },
      },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      entityType: "TournamentStatsUpload",
      entityId: upload.id,
      action: "STATS_UPLOADED",
      actorUserId,
      after: { fileName, label, sheets: sheets.map((s) => s.name) },
    });
    return upload;
  }, TX_OPTIONS);

  return { id: created.id, sheetCount: sheets.length };
}

export type StatsUploadSummary = {
  id: string;
  uploadedAt: Date;
  label: string | null;
  fileName: string;
  uploadedBy: { name: string } | null;
  sheets: { name: string; rowCount: number }[];
  isPublished: boolean;
};

/** Every upload for a league, newest first — metadata only, never the file or the grids. */
export async function listStatsUploads(leagueId: string): Promise<StatsUploadSummary[]> {
  const uploads = await prisma.tournamentStatsUpload.findMany({
    where: { leagueId },
    orderBy: [...UPLOAD_ORDER],
    select: {
      id: true,
      uploadedAt: true,
      label: true,
      fileName: true,
      uploadedBy: { select: { name: true } },
      sheets: { select: { name: true, rowCount: true }, orderBy: { position: "asc" } },
      publishedIn: { select: { id: true } },
    },
  });
  return uploads.map((u) => ({
    id: u.id,
    uploadedAt: u.uploadedAt,
    label: u.label,
    fileName: u.fileName,
    uploadedBy: u.uploadedBy,
    sheets: u.sheets,
    isPublished: u.publishedIn !== null,
  }));
}

export type StatsSheetView = { name: string; display: StatsGrid; rowCount: number; columnCount: number };

function asGrid(json: Prisma.JsonValue): StatsGrid {
  return Array.isArray(json) ? (json as unknown as StatsGrid) : [];
}

/** One upload with its sheets, for the admin's tab view. Null when it doesn't
 * exist or belongs to a different league. */
export async function getStatsUploadForAdmin(
  leagueId: string,
  uploadId: string
): Promise<{ id: string; uploadedAt: Date; label: string | null; fileName: string; isPublished: boolean; sheets: StatsSheetView[] } | null> {
  const upload = await prisma.tournamentStatsUpload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      leagueId: true,
      uploadedAt: true,
      label: true,
      fileName: true,
      publishedIn: { select: { id: true } },
      sheets: {
        select: { name: true, display: true, rowCount: true, columnCount: true },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!upload || upload.leagueId !== leagueId) return null;
  return {
    id: upload.id,
    uploadedAt: upload.uploadedAt,
    label: upload.label,
    fileName: upload.fileName,
    isPublished: upload.publishedIn !== null,
    sheets: upload.sheets.map((s) => ({
      name: s.name,
      display: asGrid(s.display),
      rowCount: s.rowCount,
      columnCount: s.columnCount,
    })),
  };
}

/** The exact bytes that were uploaded, for the admin's download. */
export async function getStatsUploadFile(
  leagueId: string,
  uploadId: string
): Promise<{ fileName: string; mimeType: string; data: Uint8Array } | null> {
  const upload = await prisma.tournamentStatsUpload.findUnique({
    where: { id: uploadId },
    select: { leagueId: true, fileName: true, mimeType: true, fileData: true },
  });
  if (!upload || upload.leagueId !== leagueId) return null;
  return { fileName: upload.fileName, mimeType: upload.mimeType, data: upload.fileData };
}

/** Removes one upload. If it was the published one the share's uploadId goes
 * null through the foreign key, so the public link stops showing it. */
export async function deleteStatsUpload(leagueId: string, uploadId: string, actorUserId: string): Promise<void> {
  const upload = await prisma.tournamentStatsUpload.findUnique({
    where: { id: uploadId },
    select: { id: true, leagueId: true, fileName: true, label: true, publishedIn: { select: { id: true } } },
  });
  if (!upload || upload.leagueId !== leagueId) throw new ValidationError("Upload not found");

  await prisma.$transaction(async (tx) => {
    await tx.tournamentStatsUpload.delete({ where: { id: uploadId } });
    await writeAuditLog(tx, {
      entityType: "TournamentStatsUpload",
      entityId: uploadId,
      action: "STATS_UPLOAD_DELETED",
      actorUserId,
      before: { fileName: upload.fileName, label: upload.label, wasPublished: upload.publishedIn !== null },
      note: upload.publishedIn ? "Was the published upload — the public link no longer shows anything" : null,
    });
  });
}

export type StatsShare = { token: string; uploadId: string | null; publishedAt: Date | null };

/** The league's public-link state, or null when sharing is off. */
export async function getStatsShare(leagueId: string): Promise<StatsShare | null> {
  return prisma.tournamentStatsShare.findUnique({
    where: { leagueId },
    select: { token: true, uploadId: true, publishedAt: true },
  });
}

/**
 * Makes one upload the league's public statistics. The first publish mints
 * the link; publishing another upload later swaps what it shows without
 * changing the URL. The token is the access credential to a public page, so —
 * as with the roster-card link — it never lands in the audit JSON.
 */
export async function publishStatsUpload(
  leagueId: string,
  uploadId: string,
  actorUserId: string
): Promise<{ token: string }> {
  const upload = await prisma.tournamentStatsUpload.findUnique({
    where: { id: uploadId },
    select: { leagueId: true, fileName: true, label: true, sheets: { select: { name: true }, orderBy: { position: "asc" } } },
  });
  if (!upload || upload.leagueId !== leagueId) throw new ValidationError("Upload not found");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.tournamentStatsShare.findUnique({ where: { leagueId }, select: { token: true } });
    const now = new Date();
    const share = await tx.tournamentStatsShare.upsert({
      where: { leagueId },
      create: { leagueId, token: existing?.token ?? newToken(), uploadId, publishedAt: now },
      update: { uploadId, publishedAt: now },
      select: { id: true, token: true },
    });
    await writeAuditLog(tx, {
      entityType: "TournamentStatsShare",
      entityId: share.id,
      action: "STATS_PUBLISHED",
      actorUserId,
      after: { uploadId, fileName: upload.fileName, label: upload.label, sheets: upload.sheets.map((s) => s.name) },
      note: existing ? "Public statistics re-published (same link)" : "Public statistics link created",
    });
    return { token: share.token };
  });
}

/** Turns the public link off: the URL stops working immediately. A no-op when it is already off. */
export async function stopSharingStats(leagueId: string, actorUserId: string): Promise<void> {
  const share = await prisma.tournamentStatsShare.findUnique({ where: { leagueId }, select: { id: true } });
  if (!share) return;
  await prisma.$transaction(async (tx) => {
    await tx.tournamentStatsShare.delete({ where: { id: share.id } });
    await writeAuditLog(tx, {
      entityType: "TournamentStatsShare",
      entityId: share.id,
      action: "STATS_SHARING_STOPPED",
      actorUserId,
      note: "Public statistics link removed",
    });
  });
}

/** Replaces the link with a fresh one, keeping the same published upload — for a link that leaked or was shared too widely. */
export async function rotateStatsLink(leagueId: string, actorUserId: string): Promise<{ token: string }> {
  const share = await prisma.tournamentStatsShare.findUnique({ where: { leagueId }, select: { id: true } });
  if (!share) throw new ValidationError("There is no public link to replace — publish an upload first");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.tournamentStatsShare.update({
      where: { id: share.id },
      data: { token: newToken() },
      select: { token: true },
    });
    await writeAuditLog(tx, {
      entityType: "TournamentStatsShare",
      entityId: share.id,
      action: "STATS_LINK_ROTATED",
      actorUserId,
      note: "Public statistics link replaced — the old link no longer works",
    });
    return { token: updated.token };
  });
}

export type PublicTournamentStats = {
  leagueId: string;
  leagueName: string;
  /** The page embeds the logo via /api/leagues/{leagueId}/logo rather than this carrying bytes. */
  hasLeagueLogo: boolean;
  label: string | null;
  publishedAt: Date | null;
  sheets: { name: string; display: StatsGrid }[];
};

/**
 * The public read path — looked up by unguessable token alone. An
 * intentionally-unauthenticated data path, like getSharedRosterCard: do not
 * add a session/role guard here or in its caller. It selects only what the
 * page shows: never the original file, the raw values, the uploader or the
 * file name.
 */
export async function getPublicTournamentStats(token: string): Promise<PublicTournamentStats | null> {
  const share = await prisma.tournamentStatsShare.findUnique({
    where: { token },
    select: {
      publishedAt: true,
      league: { select: { id: true, name: true, logo: { select: { id: true } } } },
      upload: {
        select: {
          label: true,
          sheets: { select: { name: true, display: true }, orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!share || !share.upload) return null;
  return {
    leagueId: share.league.id,
    leagueName: share.league.name,
    hasLeagueLogo: share.league.logo !== null,
    label: share.upload.label,
    publishedAt: share.publishedAt,
    sheets: share.upload.sheets.map((s) => ({ name: s.name, display: asGrid(s.display) })),
  };
}
