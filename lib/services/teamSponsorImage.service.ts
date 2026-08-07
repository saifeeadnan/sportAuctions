import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

export type SponsorImageFile = { type: string; data: Buffer };

export async function uploadTeamSponsorImage(teamId: string, file: SponsorImageFile) {
  if (file.data.length === 0) throw new ValidationError("File is empty");
  if (file.data.length > MAX_SIZE_BYTES) {
    throw new ValidationError("Sponsor image must be 5MB or smaller");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ValidationError("Only JPG or PNG images are allowed for the sponsor picture");
  }

  // See tournamentDocument.service.ts — Prisma's Bytes field wants a plain
  // Uint8Array backed by a real ArrayBuffer, not Node's Buffer.
  const data = new Uint8Array(file.data);

  return prisma.teamSponsorImage.upsert({
    where: { teamId },
    create: { teamId, mimeType: file.type, data },
    update: { mimeType: file.type, data, uploadedAt: new Date() },
  });
}

export async function deleteTeamSponsorImage(teamId: string) {
  await prisma.teamSponsorImage.deleteMany({ where: { teamId } });
}

export async function getTeamSponsorImageMeta(teamId: string) {
  return prisma.teamSponsorImage.findUnique({
    where: { teamId },
    select: { mimeType: true, uploadedAt: true },
  });
}

export async function getTeamSponsorImageContent(teamId: string) {
  return prisma.teamSponsorImage.findUnique({ where: { teamId } });
}
