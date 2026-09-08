import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import type { ParsedPointsRow, RowError } from "@/lib/services/playerPoints.service";

// The interactive-transaction form defaults to a 5 s timeout (the batch form
// this replaced had none) — a few hundred CSV rows against a remote Postgres
// can exceed that, and a half-applied points upload is worse than a slow one.
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };
const LABEL_MAX_LENGTH = 80;

const UPLOAD_ORDER = [{ uploadedAt: "desc" }, { id: "desc" }] as const satisfies Prisma.FantasyPointsUploadOrderByWithRelationInput[];

export type ApplyPointsUploadResult = {
  /** Null when no CSV row matched a player — nothing was written and no
   * snapshot was taken (today's "updated 0 players" outcome, unchanged). */
  uploadId: string | null;
  uploadedAt: Date | null;
  updatedCount: number;
  unmatched: RowError[];
};

/**
 * Applies a cumulative points CSV to this auction and records it as a
 * versioned snapshot. Matching is by login ID first, then name (both
 * case-insensitive); rows that match nobody are reported but don't block the
 * rest. Players absent from the CSV keep their previous points — the sparse
 * overwrite behavior the upload has always had — so the snapshot taken
 * AFTER applying the rows is the full effective state and stands on its own.
 *
 * Deliberately not gated on league read-only status (unlike
 * updateFantasyLockDate/updateFantasySettings): final points are routinely
 * uploaded after a league's end date, and this path has never been gated.
 */
export async function applyPointsUpload(
  auctionId: string,
  rows: ParsedPointsRow[],
  opts: { actorUserId: string; fileName?: string | null; label?: string | null }
): Promise<ApplyPointsUploadResult> {
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

  if (updates.length === 0) {
    return { uploadId: null, uploadedAt: null, updatedCount: 0, unmatched };
  }

  const label = opts.label?.trim().slice(0, LABEL_MAX_LENGTH) || null;
  const fileName = opts.fileName?.trim() || null;

  const upload = await prisma.$transaction(async (tx) => {
    // One statement for every row rather than N round-trips — the first raw
    // SQL in lib/services, kept minimal: values are parameterised, and every
    // camelCase identifier is double-quoted so Postgres doesn't fold it.
    await tx.$executeRaw`
      UPDATE "auction_players" AS ap
      SET "points" = v.points
      FROM (VALUES ${Prisma.join(
        updates.map((u) => Prisma.sql`(${u.auctionPlayerId}::text, ${u.points}::numeric)`)
      )}) AS v(id, points)
      WHERE ap."id" = v.id AND ap."auctionId" = ${auctionId}`;

    const effective = await tx.auctionPlayer.findMany({
      where: { auctionId, points: { not: null } },
      select: { id: true, points: true },
    });

    const created = await tx.fantasyPointsUpload.create({
      data: {
        auctionId,
        uploadedById: opts.actorUserId,
        label,
        fileName,
        rowCount: updates.length,
      },
    });
    await tx.fantasyPointsUploadEntry.createMany({
      data: effective.map((ap) => ({
        uploadId: created.id,
        auctionPlayerId: ap.id,
        points: ap.points!,
      })),
    });

    await writeAuditLog(tx, {
      entityType: "FantasyPointsUpload",
      entityId: created.id,
      auctionId,
      action: "FANTASY_POINTS_UPLOADED",
      actorUserId: opts.actorUserId,
      after: { rowCount: updates.length, playerCount: effective.length, label, fileName },
    });
    return created;
  }, TX_OPTIONS);

  return {
    uploadId: upload.id,
    uploadedAt: upload.uploadedAt,
    updatedCount: updates.length,
    unmatched,
  };
}

export type PointsUploadSummary = {
  id: string;
  uploadedAt: Date;
  label: string | null;
  fileName: string | null;
  rowCount: number;
  /** Players with points in the snapshot — rowCount plus carried-forward players. */
  playerCount: number;
  uploadedBy: { name: string } | null;
};

/** Every points upload for an auction, newest first. */
export async function listPointsUploads(auctionId: string): Promise<PointsUploadSummary[]> {
  const uploads = await prisma.fantasyPointsUpload.findMany({
    where: { auctionId },
    orderBy: [...UPLOAD_ORDER],
    select: {
      id: true,
      uploadedAt: true,
      label: true,
      fileName: true,
      rowCount: true,
      uploadedBy: { select: { name: true } },
      _count: { select: { entries: true } },
    },
  });
  return uploads.map((u) => ({
    id: u.id,
    uploadedAt: u.uploadedAt,
    label: u.label,
    fileName: u.fileName,
    rowCount: u.rowCount,
    playerCount: u._count.entries,
    uploadedBy: u.uploadedBy,
  }));
}

/**
 * Removes one upload (any of them, not just the newest) and rebuilds the
 * AuctionPlayer.points cache from whichever upload is newest afterwards —
 * deleting the latest reverts points to the one before it; deleting an older
 * one leaves current points as they are (but changes which upload the
 * standings' movement arrows compare against); deleting the last one clears
 * every player's points, and standings fall back to team-strength ranking.
 */
export async function deletePointsUpload(
  auctionId: string,
  uploadId: string,
  actorUserId: string
): Promise<void> {
  const upload = await prisma.fantasyPointsUpload.findUnique({
    where: { id: uploadId },
    select: { id: true, auctionId: true, uploadedAt: true, label: true, rowCount: true },
  });
  if (!upload || upload.auctionId !== auctionId) {
    throw new ValidationError("Points upload not found");
  }
  const latestBefore = await prisma.fantasyPointsUpload.findFirst({
    where: { auctionId },
    orderBy: [...UPLOAD_ORDER],
    select: { id: true },
  });
  const wasLatest = latestBefore?.id === uploadId;

  await prisma.$transaction(async (tx) => {
    await tx.fantasyPointsUpload.delete({ where: { id: uploadId } });
    const latest = await tx.fantasyPointsUpload.findFirst({
      where: { auctionId },
      orderBy: [...UPLOAD_ORDER],
      select: { id: true },
    });

    // Rebuild the cache from scratch rather than diffing — a snapshot is the
    // whole state, so "clear, then copy the newest snapshot in" is exact.
    await tx.$executeRaw`UPDATE "auction_players" SET "points" = NULL WHERE "auctionId" = ${auctionId}`;
    if (latest) {
      await tx.$executeRaw`
        UPDATE "auction_players" AS ap
        SET "points" = e."points"
        FROM "fantasy_points_upload_entries" AS e
        WHERE e."auctionPlayerId" = ap."id" AND e."uploadId" = ${latest.id}`;
    }

    await writeAuditLog(tx, {
      entityType: "FantasyPointsUpload",
      entityId: uploadId,
      auctionId,
      action: "FANTASY_POINTS_UPLOAD_DELETED",
      actorUserId,
      before: {
        uploadedAt: upload.uploadedAt.toISOString(),
        label: upload.label,
        rowCount: upload.rowCount,
      },
      note: !latest
        ? "No uploads remain — all player points cleared"
        : wasLatest
          ? `Was the latest upload — points reverted to upload ${latest.id}`
          : "Older upload removed — current points unchanged",
    });
  }, TX_OPTIONS);
}

export type PointsUploadRow = {
  playerName: string;
  loginId: string | null;
  categoryName: string;
  points: string;
};

/**
 * One upload's full snapshot as rows, highest points first — what the CSV
 * export serves. Deliberately re-uploadable: it carries the same Player /
 * Login ID / Points columns the upload parser reads (it ignores the extra
 * Category column), so an admin can restore any earlier state by uploading
 * the downloaded file as a new snapshot. Null when the upload doesn't exist
 * or belongs to a different auction.
 */
export async function getPointsUploadRows(
  auctionId: string,
  uploadId: string
): Promise<{ upload: { id: string; uploadedAt: Date; label: string | null }; rows: PointsUploadRow[] } | null> {
  const upload = await prisma.fantasyPointsUpload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      auctionId: true,
      uploadedAt: true,
      label: true,
      entries: {
        select: {
          points: true,
          auctionPlayer: {
            select: {
              player: { select: { name: true, loginId: true } },
              category: { select: { name: true } },
            },
          },
        },
        orderBy: [{ points: "desc" }, { auctionPlayer: { player: { name: "asc" } } }],
      },
    },
  });
  if (!upload || upload.auctionId !== auctionId) return null;
  return {
    upload: { id: upload.id, uploadedAt: upload.uploadedAt, label: upload.label },
    rows: upload.entries.map((e) => ({
      playerName: e.auctionPlayer.player.name,
      loginId: e.auctionPlayer.player.loginId,
      categoryName: e.auctionPlayer.category.name,
      points: String(e.points),
    })),
  };
}
