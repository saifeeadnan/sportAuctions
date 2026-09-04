import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ValidationError, InvalidStateTransitionError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";

/** Idempotent — a previously-created link never silently breaks. Not gated
 * on league read-only status, same reasoning as getOrCreateHighlightsToken:
 * whether a league is still active has nothing to do with sharing a past
 * auction's final roster. Audited (unlike the older highlights link) per the
 * "every auction change is audited" policy — but the token IS the access
 * credential to a public page, so it must never land in the audit JSON;
 * only the fact that a link was created is recorded. */
export async function getOrCreateRosterCardToken(
  entryId: string,
  actorUserId: string
): Promise<string> {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: entryId },
    select: { id: true, rosterCardToken: true, auction: { select: { id: true, status: true } } },
  });
  if (!entry) throw new ValidationError("Team entry not found");
  if (entry.auction.status !== "COMPLETED") {
    throw new InvalidStateTransitionError(
      "A shareable link can only be created once the auction has concluded"
    );
  }
  if (entry.rosterCardToken) return entry.rosterCardToken;

  const token = randomBytes(24).toString("base64url");
  await prisma.$transaction(async (tx) => {
    await tx.teamAuctionEntry.update({
      where: { id: entry.id },
      data: { rosterCardToken: token },
    });
    await writeAuditLog(tx, {
      entityType: "TeamAuctionEntry",
      entityId: entry.id,
      auctionId: entry.auction.id,
      action: "ROSTER_CARD_LINK_CREATED",
      actorUserId,
      note: "Public roster-card link created",
    });
  });
  return token;
}

export type SharedRosterCardData = {
  teamId: string;
  teamName: string;
  /** Whether the team has a sponsor picture uploaded — the page then embeds
   * it via /api/teams/{teamId}/sponsor-image rather than this type carrying
   * the bytes. */
  hasTeamImage: boolean;
  tournamentId: string;
  tournamentName: string;
  auctionName: string;
  /** Captain first (if assigned), then alphabetical — same order as the
   * downloadable PNG card. Deliberately carries no price: this is a public
   * page. */
  players: {
    id: string;
    playerName: string;
    photoUrl: string | null;
    categoryName: string;
    isCaptain: boolean;
  }[];
};

/**
 * The public read path — looked up by unguessable token alone. Like
 * getAuctionHighlights, this is an intentionally-unauthenticated data path;
 * do not add a session/role guard here or in its caller.
 */
export async function getSharedRosterCard(token: string): Promise<SharedRosterCardData | null> {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { rosterCardToken: token },
    select: {
      captainAuctionPlayerId: true,
      // sponsorImage is selected by id only — never its (up to 5 MB) bytes.
      team: { select: { id: true, name: true, sponsorImage: { select: { id: true } } } },
      auction: {
        select: { name: true, status: true, tournament: { select: { id: true, name: true } } },
      },
      playersWon: {
        select: {
          id: true,
          player: { select: { name: true, photoUrl: true } },
          category: { select: { name: true } },
        },
        orderBy: { player: { name: "asc" } },
      },
    },
  });
  if (!entry || entry.auction.status !== "COMPLETED") return null;

  const captainId = entry.captainAuctionPlayerId;
  const ordered = captainId
    ? [
        ...entry.playersWon.filter((ap) => ap.id === captainId),
        ...entry.playersWon.filter((ap) => ap.id !== captainId),
      ]
    : entry.playersWon;

  return {
    teamId: entry.team.id,
    teamName: entry.team.name,
    hasTeamImage: entry.team.sponsorImage != null,
    tournamentId: entry.auction.tournament.id,
    tournamentName: entry.auction.tournament.name,
    auctionName: entry.auction.name,
    players: ordered.map((ap) => ({
      id: ap.id,
      playerName: ap.player.name,
      photoUrl: ap.player.photoUrl,
      categoryName: ap.category.name,
      isCaptain: ap.id === captainId,
    })),
  };
}
