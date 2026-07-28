import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export type RulesDocumentFile = { name: string; type: string; data: Buffer };

export async function uploadRulesDocument(
  tournamentId: string,
  file: RulesDocumentFile,
  uploadedById: string
) {
  if (file.data.length === 0) throw new ValidationError("File is empty");
  if (file.data.length > MAX_SIZE_BYTES) {
    throw new ValidationError("File must be 10MB or smaller");
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ValidationError("Only PDF, Word (.doc/.docx), or plain text documents are allowed");
  }

  // Prisma's Bytes field wants a Uint8Array backed by a real ArrayBuffer, not
  // Node's Buffer (typed as Uint8Array<ArrayBufferLike>, which also admits a
  // SharedArrayBuffer) — copy into a plain Uint8Array to satisfy that.
  const data = new Uint8Array(file.data);

  return prisma.tournamentDocument.upsert({
    where: { tournamentId },
    create: {
      tournamentId,
      fileName: file.name,
      mimeType: file.type,
      data,
      uploadedById,
    },
    update: {
      fileName: file.name,
      mimeType: file.type,
      data,
      uploadedById,
      uploadedAt: new Date(),
    },
  });
}

export async function deleteRulesDocument(tournamentId: string) {
  await prisma.tournamentDocument.deleteMany({ where: { tournamentId } });
}

export async function getRulesDocumentMeta(tournamentId: string) {
  return prisma.tournamentDocument.findUnique({
    where: { tournamentId },
    select: { fileName: true, mimeType: true, uploadedAt: true },
  });
}

export async function getRulesDocumentContent(tournamentId: string) {
  return prisma.tournamentDocument.findUnique({ where: { tournamentId } });
}

type ViewerUser = { id: string; role: string; leagueId: string | null };

async function resolveCanView(
  tournament: { id: string; rosterId: string; leagueId: string },
  user: ViewerUser
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (user.role === "LEAGUE_ADMIN") return user.leagueId === tournament.leagueId;

  if (user.role === "TEAM_MANAGER") {
    // A manager should see a tournament's rules as soon as they're assigned a
    // team in it — well before any auction exists to draft/bid in, since
    // that's exactly when rules matter most.
    const managedTeam = await prisma.team.findFirst({
      where: { tournamentId: tournament.id, managerId: user.id },
      select: { id: true },
    });
    if (managedTeam) return true;
  }

  const account = await prisma.user.findUnique({ where: { id: user.id } });
  if (!account?.loginId) return false;

  const match = await prisma.player.findFirst({
    where: {
      rosterId: tournament.rosterId,
      loginId: { equals: account.loginId, mode: "insensitive" },
    },
  });
  return !!match;
}

/**
 * True if the caller may view a tournament's rules document: the Admin/League
 * Admin who manages it, a manager of one of its teams, or any user whose
 * login ID matches a player on the tournament's own roster — the "on the
 * roster" criterion, independent of role.
 */
export async function canViewRulesDocument(
  tournamentId: string,
  user: ViewerUser
): Promise<boolean> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return false;
  return resolveCanView(tournament, user);
}

/** The rules document's metadata, but only if the caller is actually allowed
 * to view it and one has been uploaded — for UI code deciding whether to show
 * a "view rules" link at all, in one round trip per tournament. */
export async function getRulesDocumentIfViewable(tournamentId: string, user: ViewerUser) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return null;
  if (!(await resolveCanView(tournament, user))) return null;
  return getRulesDocumentMeta(tournamentId);
}
