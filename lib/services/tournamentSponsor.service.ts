import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

export type SponsorLogoFile = { type: string; data: Buffer };

export type AddTournamentSponsorInput = {
  tournamentId: string;
  name: string;
  websiteUrl?: string;
  file: SponsorLogoFile;
};

function normalizeWebsiteUrl(url?: string): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  // Accept "example.com" as well as "https://example.com" — a sponsor link
  // shouldn't require the admin to remember the scheme.
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function addTournamentSponsor(input: AddTournamentSponsorInput) {
  if (!input.name.trim()) throw new ValidationError("Sponsor name is required");
  if (input.file.data.length === 0) throw new ValidationError("Logo file is empty");
  if (input.file.data.length > MAX_SIZE_BYTES) {
    throw new ValidationError("Logo must be 5MB or smaller");
  }
  if (!ALLOWED_MIME_TYPES.has(input.file.type)) {
    throw new ValidationError("Only JPG or PNG images are allowed for the sponsor logo");
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!tournament) throw new ValidationError("Tournament not found");

  return prisma.tournamentSponsor.create({
    data: {
      tournamentId: input.tournamentId,
      name: input.name.trim(),
      websiteUrl: normalizeWebsiteUrl(input.websiteUrl),
      mimeType: input.file.type,
      // Prisma's Bytes field wants a plain Uint8Array backed by a real
      // ArrayBuffer, not Node's Buffer.
      data: new Uint8Array(input.file.data),
    },
  });
}

export async function deleteTournamentSponsor(sponsorId: string) {
  const { count } = await prisma.tournamentSponsor.deleteMany({ where: { id: sponsorId } });
  if (count === 0) throw new ValidationError("Sponsor not found");
}

export async function listTournamentSponsors(tournamentId: string) {
  return prisma.tournamentSponsor.findMany({
    where: { tournamentId },
    select: { id: true, name: true, websiteUrl: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getTournamentSponsor(sponsorId: string) {
  return prisma.tournamentSponsor.findUnique({ where: { id: sponsorId } });
}

export async function getTournamentSponsorLogoContent(sponsorId: string) {
  return prisma.tournamentSponsor.findUnique({
    where: { id: sponsorId },
    select: { mimeType: true, data: true },
  });
}

export type KnownSponsor = { id: string; name: string; websiteUrl: string | null };

/** Distinct-by-name sponsors already used somewhere in scope, for the
 * "choose existing" picker — excludes names already attached to `tournamentId`
 * so the picker doesn't offer obvious duplicates. */
export async function listKnownSponsors(
  tournamentId: string,
  leagueId: string | null
): Promise<KnownSponsor[]> {
  const existing = await prisma.tournamentSponsor.findMany({
    where: { tournamentId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

  const rows = await prisma.tournamentSponsor.findMany({
    where: leagueId ? { tournament: { leagueId } } : {},
    select: { id: true, name: true, websiteUrl: true },
    orderBy: { createdAt: "desc" },
  });

  const seen = new Set<string>();
  const distinct: KnownSponsor[] = [];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key) || existingNames.has(key)) continue;
    seen.add(key);
    distinct.push({ id: row.id, name: row.name, websiteUrl: row.websiteUrl });
  }
  return distinct;
}

export async function addExistingTournamentSponsor(tournamentId: string, sourceSponsorId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new ValidationError("Tournament not found");

  const source = await prisma.tournamentSponsor.findUnique({ where: { id: sourceSponsorId } });
  if (!source) throw new ValidationError("Sponsor not found");

  return prisma.tournamentSponsor.create({
    data: {
      tournamentId,
      name: source.name,
      websiteUrl: source.websiteUrl,
      mimeType: source.mimeType,
      // Re-wrap the driver-read Bytes value — same Uint8Array<ArrayBuffer>
      // gotcha as writing freshly-uploaded bytes.
      data: new Uint8Array(source.data),
    },
  });
}
