import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { AuthError } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import {
  PHOTO_MAX_SIZE_BYTES,
  PHOTO_ALLOWED_MIME_TYPES,
  validatePhotoUrl,
  type ProfilePhotoFile,
} from "@/lib/services/user.service";

export type PlayerPhotoFile = ProfilePhotoFile;

export type ResolvedPlayerPhoto =
  | { kind: "bytes"; mimeType: string; data: Uint8Array; live: boolean }
  | { kind: "redirect"; url: string }
  | { kind: "none" };

/** Every Player row this user can self-manage, across every roster/league —
 * deliberately not scoped to a single rosterId (unlike findSelfPlayer et
 * al. elsewhere), since a loginId can legitimately match rows on multiple
 * rosters. */
async function findOwnedPlayers(userId: string, playerIds?: string[]) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { loginId: true } });
  if (!user?.loginId) return [];
  return prisma.player.findMany({
    where: {
      loginId: { equals: user.loginId, mode: "insensitive" },
      ...(playerIds ? { id: { in: playerIds } } : {}),
    },
    include: { roster: { include: { league: { select: { name: true } } } } },
  });
}

/** Every Player row matching the caller's loginId, across every roster and
 * league — powers the "Your roster photos" section on the profile page. */
export async function listMyPlayerRows(userId: string) {
  const players = await findOwnedPlayers(userId);
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      photoUrl: p.photoUrl,
      linkedUserId: p.linkedUserId,
      rosterId: p.rosterId,
      rosterName: p.roster.name,
      leagueName: p.roster.league.name,
    }))
    .sort((a, b) => a.leagueName.localeCompare(b.leagueName) || a.rosterName.localeCompare(b.rosterName));
}

/** Throws AuthError — same message for "not found" and "found but not
 * mine" — to avoid leaking which player ids exist to a caller who doesn't
 * own them. */
export async function assertOwnsPlayer(userId: string, playerId: string) {
  const [player] = await findOwnedPlayers(userId, [playerId]);
  if (!player) throw new AuthError("You don't have access to this player's photo");
  return player;
}

/** Live-resolves what /api/players/[id]/photo should serve for this player,
 * re-read fresh on every call — a linked player never has its own bytes
 * copied in, so changing or removing the linked account's profile photo is
 * reflected on the very next request. */
export async function getResolvedPlayerPhoto(playerId: string): Promise<ResolvedPlayerPhoto> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { linkedUserId: true },
  });
  if (!player) return { kind: "none" };

  if (player.linkedUserId) {
    const user = await prisma.user.findUnique({
      where: { id: player.linkedUserId },
      select: { photoMimeType: true, photoData: true, photoUrl: true },
    });
    if (user?.photoData && user.photoMimeType) {
      return {
        kind: "bytes",
        mimeType: user.photoMimeType,
        data: new Uint8Array(user.photoData),
        live: true,
      };
    }
    if (user?.photoUrl) return { kind: "redirect", url: user.photoUrl };
    return { kind: "none" };
  }

  const photo = await prisma.playerPhoto.findUnique({ where: { playerId } });
  if (!photo) return { kind: "none" };
  return { kind: "bytes", mimeType: photo.mimeType, data: new Uint8Array(photo.data), live: false };
}

/** Self-service, independent photo for one Player row — exactly one of
 * `file` or `photoUrl`, same upload-OR-link shape as the account profile
 * photo. Clears any live link, since an explicit upload/URL here is a
 * deliberate override. */
export async function updatePlayerPhotoSelf(
  userId: string,
  playerId: string,
  input: { file?: PlayerPhotoFile; photoUrl?: string }
) {
  const player = await assertOwnsPlayer(userId, playerId);

  if (input.file && input.photoUrl) {
    throw new ValidationError("Provide either a photo file or a photo URL, not both");
  }
  if (!input.file && !input.photoUrl) {
    throw new ValidationError("Provide a photo file or a photo URL");
  }

  let photoUrl: string;

  await prisma.$transaction(async (tx) => {
    if (input.file) {
      if (input.file.data.length === 0) throw new ValidationError("Photo file is empty");
      if (input.file.data.length > PHOTO_MAX_SIZE_BYTES) {
        throw new ValidationError("Photo must be 300KB or smaller");
      }
      if (!PHOTO_ALLOWED_MIME_TYPES.has(input.file.type)) {
        throw new ValidationError("Only JPG or PNG images are allowed for the photo");
      }
      const data = new Uint8Array(input.file.data);
      await tx.playerPhoto.upsert({
        where: { playerId },
        create: { playerId, mimeType: input.file.type, data },
        update: { mimeType: input.file.type, data, uploadedAt: new Date() },
      });
      photoUrl = `/api/players/${playerId}/photo`;
    } else {
      validatePhotoUrl(input.photoUrl!);
      photoUrl = input.photoUrl!.trim();
      await tx.playerPhoto.deleteMany({ where: { playerId } });
    }

    await tx.player.update({ where: { id: playerId }, data: { photoUrl, linkedUserId: null } });
    await writeAuditLog(tx, {
      entityType: "Player",
      entityId: playerId,
      action: "PLAYER_PHOTO_UPDATED_SELF",
      actorUserId: userId,
      before: { photoUrl: player.photoUrl, linkedUserId: player.linkedUserId },
      after: { photoUrl, linkedUserId: null },
    });
  });
}

/** Clears a self-managed Player's photo entirely (independent upload or
 * live link) back to "no photo". No-ops if already empty. */
export async function removePlayerPhotoSelf(userId: string, playerId: string) {
  const player = await assertOwnsPlayer(userId, playerId);
  if (!player.photoUrl && !player.linkedUserId) return;

  await prisma.$transaction(async (tx) => {
    await tx.playerPhoto.deleteMany({ where: { playerId } });
    await tx.player.update({ where: { id: playerId }, data: { photoUrl: null, linkedUserId: null } });
    await writeAuditLog(tx, {
      entityType: "Player",
      entityId: playerId,
      action: "PLAYER_PHOTO_REMOVED_SELF",
      actorUserId: userId,
      before: { photoUrl: player.photoUrl, linkedUserId: player.linkedUserId },
      after: { photoUrl: null, linkedUserId: null },
    });
  });
}

async function requireOwnProfilePhoto(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { photoUrl: true, photoMimeType: true },
  });
  if (!user.photoUrl && !user.photoMimeType) {
    throw new ValidationError("Set a profile picture first, then link it to a roster");
  }
}

/** Live-links a single Player row to the caller's own account photo — see
 * getResolvedPlayerPhoto for how that's resolved fresh on every request. */
export async function linkPlayerPhotoToProfile(userId: string, playerId: string) {
  await requireOwnProfilePhoto(userId);
  const player = await assertOwnsPlayer(userId, playerId);

  await prisma.$transaction(async (tx) => {
    await tx.playerPhoto.deleteMany({ where: { playerId } });
    await tx.player.update({
      where: { id: playerId },
      data: { linkedUserId: userId, photoUrl: `/api/players/${playerId}/photo` },
    });
    await writeAuditLog(tx, {
      entityType: "Player",
      entityId: playerId,
      action: "PLAYER_PHOTO_LINKED_TO_PROFILE_SELF",
      actorUserId: userId,
      before: { photoUrl: player.photoUrl, linkedUserId: player.linkedUserId },
      after: { linkedUserId: userId },
    });
  });
}

/** Bulk version of linkPlayerPhotoToProfile — re-derives the owned subset
 * of `playerIds` server-side rather than trusting the submitted list, so a
 * tampered id belonging to someone else's Player row is silently skipped,
 * never linked. */
export async function linkPlayerPhotosToProfile(userId: string, playerIds: string[]) {
  await requireOwnProfilePhoto(userId);
  const owned = await findOwnedPlayers(userId, playerIds);
  if (owned.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const player of owned) {
      await tx.playerPhoto.deleteMany({ where: { playerId: player.id } });
      await tx.player.update({
        where: { id: player.id },
        data: { linkedUserId: userId, photoUrl: `/api/players/${player.id}/photo` },
      });
      await writeAuditLog(tx, {
        entityType: "Player",
        entityId: player.id,
        action: "PLAYER_PHOTO_LINKED_TO_PROFILE_SELF",
        actorUserId: userId,
        before: { photoUrl: player.photoUrl, linkedUserId: player.linkedUserId },
        after: { linkedUserId: userId },
      });
    }
  });
}
