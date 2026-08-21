import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { assertLeagueNotReadOnly } from "@/lib/services/league.service";
import { SPONSOR_TIERS, DEFAULT_SPONSOR_TIER, type SponsorTier } from "@/lib/sponsorTiers";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

/** Shared by addTournamentSponsor and addExistingTournamentSponsor — loads
 * the tournament with its league, checks read-only, and enforces the
 * per-tournament sponsor cap (not league-wide — each TournamentSponsor row
 * belongs to exactly one tournament). */
async function loadTournamentForSponsorCreate(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { league: true },
  });
  if (!tournament) throw new ValidationError("Tournament not found");
  assertLeagueNotReadOnly(tournament.league);

  if (tournament.league.maxSponsorsPerTournament != null) {
    const count = await prisma.tournamentSponsor.count({ where: { tournamentId } });
    if (count >= tournament.league.maxSponsorsPerTournament) {
      throw new ValidationError(
        `This tournament already has the maximum of ${tournament.league.maxSponsorsPerTournament} sponsor(s)`
      );
    }
  }
  return tournament;
}

export type SponsorLogoFile = { type: string; data: Buffer };

export type AddTournamentSponsorInput = {
  tournamentId: string;
  name: string;
  websiteUrl?: string;
  /** Exactly one of `file` or `logoUrl` must be provided — a sponsor's logo
   * is either uploaded bytes or an external URL, never both. */
  file?: SponsorLogoFile;
  logoUrl?: string;
  tier?: string;
};

function normalizeWebsiteUrl(url?: string): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  // Accept "example.com" as well as "https://example.com" — a sponsor link
  // shouldn't require the admin to remember the scheme.
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function validateLogoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new ValidationError("Logo URL is required");
  try {
    new URL(trimmed);
  } catch {
    throw new ValidationError("Logo URL must be a valid URL");
  }
  return trimmed;
}

function validateTier(tier: string | undefined): SponsorTier {
  if (!tier) return DEFAULT_SPONSOR_TIER;
  if (!SPONSOR_TIERS.includes(tier as SponsorTier)) {
    throw new ValidationError(`Unknown sponsor tier "${tier}"`);
  }
  return tier as SponsorTier;
}

export async function addTournamentSponsor(input: AddTournamentSponsorInput) {
  if (!input.name.trim()) throw new ValidationError("Sponsor name is required");
  if (input.file && input.logoUrl) {
    throw new ValidationError("Provide either a logo file or a logo URL, not both");
  }
  if (!input.file && !input.logoUrl) {
    throw new ValidationError("Provide a logo file or a logo URL");
  }

  let logoUrl: string | undefined;
  let mimeType: string | undefined;
  let data: Uint8Array<ArrayBuffer> | undefined;

  if (input.file) {
    if (input.file.data.length === 0) throw new ValidationError("Logo file is empty");
    if (input.file.data.length > MAX_SIZE_BYTES) {
      throw new ValidationError("Logo must be 5MB or smaller");
    }
    if (!ALLOWED_MIME_TYPES.has(input.file.type)) {
      throw new ValidationError("Only JPG or PNG images are allowed for the sponsor logo");
    }
    mimeType = input.file.type;
    // Prisma's Bytes field wants a plain Uint8Array backed by a real
    // ArrayBuffer, not Node's Buffer.
    data = new Uint8Array(input.file.data);
  } else {
    logoUrl = validateLogoUrl(input.logoUrl!);
  }

  const tier = validateTier(input.tier);
  await loadTournamentForSponsorCreate(input.tournamentId);

  return prisma.tournamentSponsor.create({
    data: {
      tournamentId: input.tournamentId,
      name: input.name.trim(),
      tier,
      websiteUrl: normalizeWebsiteUrl(input.websiteUrl),
      logoUrl,
      mimeType,
      data,
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
    select: { id: true, name: true, tier: true, websiteUrl: true, logoUrl: true, createdAt: true },
    orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
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

export type KnownSponsor = {
  id: string;
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
};

/** Distinct-by-name sponsors already used somewhere in scope, for the
 * "choose existing" picker — excludes names already attached to `tournamentId`
 * so the picker doesn't offer obvious duplicates. */
export async function listKnownSponsors(
  tournamentId: string,
  leagueIds: string[] | null
): Promise<KnownSponsor[]> {
  const existing = await prisma.tournamentSponsor.findMany({
    where: { tournamentId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((s) => s.name.toLowerCase()));

  const rows = await prisma.tournamentSponsor.findMany({
    where: leagueIds ? { tournament: { leagueId: { in: leagueIds } } } : {},
    select: { id: true, name: true, websiteUrl: true, logoUrl: true },
    orderBy: { createdAt: "desc" },
  });

  const seen = new Set<string>();
  const distinct: KnownSponsor[] = [];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key) || existingNames.has(key)) continue;
    seen.add(key);
    distinct.push({ id: row.id, name: row.name, websiteUrl: row.websiteUrl, logoUrl: row.logoUrl });
  }
  return distinct;
}

export async function addExistingTournamentSponsor(
  tournamentId: string,
  sourceSponsorId: string,
  tier?: string
) {
  await loadTournamentForSponsorCreate(tournamentId);

  const source = await prisma.tournamentSponsor.findUnique({ where: { id: sourceSponsorId } });
  if (!source) throw new ValidationError("Sponsor not found");

  return prisma.tournamentSponsor.create({
    data: {
      tournamentId,
      name: source.name,
      // Tier is a per-placement/deal concept, not inherited from the source
      // sponsor — the same real company can be TITLE for one tournament and
      // COMMUNITY for another, so this is deliberately validateTier(tier),
      // never source.tier.
      tier: validateTier(tier),
      websiteUrl: source.websiteUrl,
      logoUrl: source.logoUrl,
      mimeType: source.mimeType,
      // Re-wrap the driver-read Bytes value — same Uint8Array<ArrayBuffer>
      // gotcha as writing freshly-uploaded bytes. A URL-backed source has no
      // bytes to copy — its logoUrl above already carries everything needed.
      data: source.data ? (new Uint8Array(source.data) as Uint8Array<ArrayBuffer>) : undefined,
    },
  });
}
