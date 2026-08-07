import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

export type LeagueLogoFile = { type: string; data: Buffer };

export async function uploadLeagueLogo(leagueId: string, file: LeagueLogoFile) {
  if (file.data.length === 0) throw new ValidationError("File is empty");
  if (file.data.length > MAX_SIZE_BYTES) {
    throw new ValidationError("League logo must be 5MB or smaller");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ValidationError("Only JPG or PNG images are allowed for the league logo");
  }

  // See teamSponsorImage.service.ts — Prisma's Bytes field wants a plain
  // Uint8Array backed by a real ArrayBuffer, not Node's Buffer.
  const data = new Uint8Array(file.data);

  return prisma.leagueLogo.upsert({
    where: { leagueId },
    create: { leagueId, mimeType: file.type, data },
    update: { mimeType: file.type, data, uploadedAt: new Date() },
  });
}

export async function deleteLeagueLogo(leagueId: string) {
  await prisma.leagueLogo.deleteMany({ where: { leagueId } });
}

export async function getLeagueLogoMeta(leagueId: string) {
  return prisma.leagueLogo.findUnique({
    where: { leagueId },
    select: { mimeType: true, uploadedAt: true },
  });
}

export async function getLeagueLogoContent(leagueId: string) {
  return prisma.leagueLogo.findUnique({ where: { leagueId } });
}
