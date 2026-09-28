import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import { validatePickleballSchedule } from "@/lib/pickleballSchedule/schema";
import {
  computeMatchResult,
  computeStandings,
  type PickleballMatchForStandings,
  type PickleballMatchResult,
  type PickleballStandingsRow,
} from "@/lib/pickleball/standings";

// Same reasoning as tournamentStats.service.ts's TX_OPTIONS: a schedule
// upload creates one row per game across every match in one transaction,
// which can exceed the interactive-transaction default of 5s against a
// remote Postgres.
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Creates the tournament's one pickleball event, tied to the completed
 * auction whose TeamAuctionEntry.playersWon supplies every team's roster —
 * per team, whatever that auction actually drafted for them.
 */
export async function createPickleballEvent(
  tournamentId: string,
  auctionId: string,
  actorUserId: string
): Promise<{ id: string }> {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, tournamentId: true, status: true },
  });
  if (!auction || auction.tournamentId !== tournamentId) {
    throw new ValidationError("Auction not found for this tournament");
  }
  if (auction.status !== "COMPLETED") {
    throw new ValidationError("Choose a completed auction — its results become this event's team rosters");
  }

  const existing = await prisma.pickleballEvent.findUnique({ where: { tournamentId }, select: { id: true } });
  if (existing) throw new ValidationError("This tournament already has a pickleball event");

  return prisma.$transaction(async (tx) => {
    const event = await tx.pickleballEvent.create({
      data: { tournamentId, auctionId, createdById: actorUserId },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      entityType: "PickleballEvent",
      entityId: event.id,
      auctionId,
      action: "PICKLEBALL_EVENT_CREATED",
      actorUserId,
    });
    return event;
  });
}

/**
 * Deletes the event entirely — schedule, teams, matches, every game's
 * players and scores, and the public link, all cascading from the one row
 * (see the schema's onDelete: Cascade chain). The only way to change a
 * schedule once scoring has started that isn't a full score reset; there is
 * no undo. The audit row outlives the entity it describes, same convention
 * as every other delete in this app.
 */
export async function deletePickleballEvent(tournamentId: string, eventId: string, actorUserId: string): Promise<void> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { id: true, tournamentId: true, fileName: true, token: true },
  });
  if (!event || event.tournamentId !== tournamentId) throw new ValidationError("Pickleball event not found");

  await prisma.$transaction(async (tx) => {
    await tx.pickleballEvent.delete({ where: { id: eventId } });
    await writeAuditLog(tx, {
      entityType: "PickleballEvent",
      entityId: eventId,
      action: "PICKLEBALL_EVENT_DELETED",
      actorUserId,
      before: { fileName: event.fileName, wasPublished: event.token !== null },
    });
  });
}

async function loadEventCore(eventId: string) {
  return prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      tournamentId: true,
      auctionId: true,
      token: true,
      publishedAt: true,
      fileName: true,
      uploadedAt: true,
      tournament: {
        select: { id: true, name: true, leagueId: true, league: { select: { id: true, name: true, logo: { select: { id: true } } } } },
      },
      teams: {
        select: { teamId: true, group: true, team: { select: { name: true } } },
        orderBy: { team: { name: "asc" } },
      },
      matches: {
        select: {
          id: true,
          matchNumber: true,
          round: true,
          court: true,
          group: true,
          gamesToPlay: true,
          team1Id: true,
          team1: { select: { name: true } },
          team2Id: true,
          team2: { select: { name: true } },
          games: {
            select: {
              gameNumber: true,
              team1Score: true,
              team2Score: true,
              team1Player1: { select: { name: true } },
              team1Player2: { select: { name: true } },
              team2Player1: { select: { name: true } },
              team2Player2: { select: { name: true } },
            },
            orderBy: { gameNumber: "asc" },
          },
        },
        orderBy: [{ matchNumber: "asc" }],
      },
    },
  });
}

type LoadedEvent = NonNullable<Awaited<ReturnType<typeof loadEventCore>>>;

export type PickleballGameView = {
  gameNumber: number;
  team1Players: string[];
  team2Players: string[];
  team1Score: number | null;
  team2Score: number | null;
};
export type PickleballMatchView = {
  id: string;
  matchNumber: number;
  round: string;
  court: string | null;
  group: string;
  team1Id: string;
  team1Name: string;
  team2Id: string;
  team2Name: string;
  gamesToPlay: number;
  games: PickleballGameView[];
  result: PickleballMatchResult;
};
export type PickleballStandingsRowView = PickleballStandingsRow & { teamName: string };

/** Match Results + Standings, computed live from every match's games — never
 * stored, so the admin preview and the public/OBS views can never drift from
 * each other or from what was actually entered. */
function toEventView(loaded: LoadedEvent): { matches: PickleballMatchView[]; standings: PickleballStandingsRowView[] } {
  const forStandings = (m: LoadedEvent["matches"][number]): PickleballMatchForStandings => ({
    id: m.id,
    team1Id: m.team1Id,
    team2Id: m.team2Id,
    gamesToPlay: m.gamesToPlay,
    games: m.games.map((g) => ({ gameNumber: g.gameNumber, team1Score: g.team1Score, team2Score: g.team2Score })),
  });

  const matches: PickleballMatchView[] = loaded.matches.map((m) => ({
    id: m.id,
    matchNumber: m.matchNumber,
    round: m.round,
    court: m.court,
    group: m.group,
    team1Id: m.team1Id,
    team1Name: m.team1.name,
    team2Id: m.team2Id,
    team2Name: m.team2.name,
    gamesToPlay: m.gamesToPlay,
    games: m.games.map((g) => ({
      gameNumber: g.gameNumber,
      team1Players: [g.team1Player1?.name, g.team1Player2?.name].filter((n): n is string => Boolean(n)),
      team2Players: [g.team2Player1?.name, g.team2Player2?.name].filter((n): n is string => Boolean(n)),
      team1Score: g.team1Score,
      team2Score: g.team2Score,
    })),
    result: computeMatchResult(forStandings(m)),
  }));

  const teamNameById = new Map(loaded.teams.map((t) => [t.teamId, t.team.name]));
  const standingsBase = computeStandings(
    loaded.teams.map((t) => ({ teamId: t.teamId, group: t.group })),
    loaded.matches.map(forStandings)
  );
  const standings = standingsBase.map((row) => ({ ...row, teamName: teamNameById.get(row.teamId) ?? "" }));

  return { matches, standings };
}

export type PickleballEventForAdmin = {
  id: string;
  tournamentId: string;
  auctionId: string;
  leagueId: string;
  leagueName: string;
  tournamentName: string;
  hasSchedule: boolean;
  fileName: string | null;
  uploadedAt: Date | null;
  /** True once any game has a player or a score saved. Once true,
   * savePickleballSchedule refuses a re-upload. */
  anyGameDataEntered: boolean;
  isPublished: boolean;
  token: string | null;
  publishedAt: Date | null;
  matches: PickleballMatchView[];
  standings: PickleballStandingsRowView[];
};

/** The admin's view of a tournament's pickleball event — the same computed
 * Match Results/Standings the public page shows, plus admin-only metadata.
 * Null when the tournament has no event yet. */
export async function getPickleballEventForAdmin(tournamentId: string): Promise<PickleballEventForAdmin | null> {
  const pointer = await prisma.pickleballEvent.findUnique({ where: { tournamentId }, select: { id: true } });
  if (!pointer) return null;
  const loaded = await loadEventCore(pointer.id);
  if (!loaded) return null;

  const { matches, standings } = toEventView(loaded);
  const anyGameDataEntered = loaded.matches.some((m) =>
    m.games.some(
      (g) =>
        g.team1Score !== null ||
        g.team2Score !== null ||
        g.team1Player1 !== null ||
        g.team1Player2 !== null ||
        g.team2Player1 !== null ||
        g.team2Player2 !== null
    )
  );

  return {
    id: loaded.id,
    tournamentId: loaded.tournamentId,
    auctionId: loaded.auctionId,
    leagueId: loaded.tournament.leagueId,
    leagueName: loaded.tournament.league.name,
    tournamentName: loaded.tournament.name,
    hasSchedule: loaded.fileName !== null,
    fileName: loaded.fileName,
    uploadedAt: loaded.uploadedAt,
    anyGameDataEntered,
    isPublished: loaded.publishedAt !== null,
    token: loaded.token,
    publishedAt: loaded.publishedAt,
    matches,
    standings,
  };
}

export type SavePickleballScheduleInput = {
  fileName: string;
  mimeType: string;
  fileBytes: Uint8Array;
  /** As the browser parsed and the admin's review screen resolved them —
   * validated here, never trusted. */
  teams: unknown;
  matches: unknown;
};

/**
 * Replaces the event's teams/matches/(blank) games from a validated upload.
 * Refuses once any game already has a score — re-uploading a schedule after
 * the tournament has started would otherwise silently discard entered
 * results; delete the event and create a new one instead.
 */
export async function savePickleballSchedule(
  tournamentId: string,
  eventId: string,
  input: SavePickleballScheduleInput,
  actorUserId: string
): Promise<void> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { id: true, tournamentId: true, fileName: true },
  });
  if (!event || event.tournamentId !== tournamentId) throw new ValidationError("Pickleball event not found");

  if (input.fileBytes.length === 0) throw new ValidationError("File is empty");
  if (input.fileBytes.length > MAX_FILE_BYTES) throw new ValidationError("File must be 10MB or smaller");
  const fileName = input.fileName.trim().slice(0, 255);
  if (!fileName) throw new ValidationError("The file has no name");
  const mimeType = input.mimeType.trim().slice(0, 200) || "application/octet-stream";

  const tournamentTeams = await prisma.team.findMany({ where: { tournamentId }, select: { id: true } });
  const validated = validatePickleballSchedule(
    { teams: input.teams, matches: input.matches },
    { validTeamIds: new Set(tournamentTeams.map((t) => t.id)) }
  );

  // Prisma's Bytes wants a plain-ArrayBuffer Uint8Array, not a Node Buffer
  // (see tournamentDocument.service.ts).
  const fileData = new Uint8Array(input.fileBytes);
  const wasReplacement = event.fileName !== null;

  await prisma.$transaction(async (tx) => {
    const touchedCount = await tx.pickleballGame.count({
      where: {
        match: { eventId },
        OR: [
          { team1Score: { not: null } },
          { team2Score: { not: null } },
          { team1Player1Id: { not: null } },
          { team1Player2Id: { not: null } },
          { team2Player1Id: { not: null } },
          { team2Player2Id: { not: null } },
        ],
      },
    });
    if (touchedCount > 0) {
      throw new ValidationError(
        "Players or scores have already been entered for this event's schedule — delete the event and create a new one to change it"
      );
    }

    // Positions have no unique constraint here (unlike TournamentStatsSheet),
    // so the old rows are simply replaced: deleting a match cascades to its
    // games (onDelete: Cascade on PickleballGame.matchId).
    await tx.pickleballEventTeam.deleteMany({ where: { eventId } });
    await tx.pickleballMatch.deleteMany({ where: { eventId } });

    await tx.pickleballEventTeam.createMany({
      data: validated.teams.map((t) => ({ eventId, teamId: t.teamId, group: t.group })),
    });
    for (const m of validated.matches) {
      await tx.pickleballMatch.create({
        data: {
          eventId,
          matchNumber: m.matchNumber,
          round: m.round,
          court: m.court,
          group: m.group,
          team1Id: m.team1Id,
          team2Id: m.team2Id,
          gamesToPlay: m.gamesToPlay,
          games: { create: Array.from({ length: m.gamesToPlay }, (_, i) => ({ gameNumber: i + 1 })) },
        },
      });
    }

    await tx.pickleballEvent.update({
      where: { id: eventId },
      data: { fileName, mimeType, fileData, uploadedAt: new Date(), uploadedById: actorUserId },
    });

    await writeAuditLog(tx, {
      entityType: "PickleballEvent",
      entityId: eventId,
      action: "PICKLEBALL_SCHEDULE_UPLOADED",
      actorUserId,
      after: { fileName, teams: validated.teams.length, matches: validated.matches.length },
      note: wasReplacement ? "Replaced the schedule (no players or scores had been entered yet)" : null,
    });
  }, TX_OPTIONS);
}

/** The exact bytes that were uploaded, for the admin's download. */
export async function getPickleballScheduleFile(
  tournamentId: string,
  eventId: string
): Promise<{ fileName: string; mimeType: string; data: Uint8Array } | null> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { tournamentId: true, fileName: true, mimeType: true, fileData: true },
  });
  if (!event || event.tournamentId !== tournamentId || !event.fileName || !event.mimeType || !event.fileData) {
    return null;
  }
  return { fileName: event.fileName, mimeType: event.mimeType, data: event.fileData };
}

/** Turns on the event's public link — the first publish mints it, a later
 * one just re-confirms the same link keeps showing this event. */
export async function publishPickleballEvent(
  tournamentId: string,
  eventId: string,
  actorUserId: string
): Promise<{ token: string }> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { id: true, tournamentId: true, token: true, fileName: true },
  });
  if (!event || event.tournamentId !== tournamentId) throw new ValidationError("Pickleball event not found");
  if (!event.fileName) throw new ValidationError("Upload a schedule before publishing");

  return prisma.$transaction(async (tx) => {
    const token = event.token ?? newToken();
    await tx.pickleballEvent.update({ where: { id: eventId }, data: { token, publishedAt: new Date() } });
    await writeAuditLog(tx, {
      entityType: "PickleballEvent",
      entityId: eventId,
      action: "PICKLEBALL_PUBLISHED",
      actorUserId,
      note: event.token ? "Re-published (same link)" : "Public link created",
    });
    return { token };
  });
}

/** Turns the public link off: the URL stops working immediately. A no-op when it is already off. */
export async function stopSharingPickleball(tournamentId: string, eventId: string, actorUserId: string): Promise<void> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { id: true, tournamentId: true, token: true },
  });
  if (!event || event.tournamentId !== tournamentId) throw new ValidationError("Pickleball event not found");
  if (!event.token) return;

  await prisma.$transaction(async (tx) => {
    await tx.pickleballEvent.update({ where: { id: eventId }, data: { token: null, publishedAt: null } });
    await writeAuditLog(tx, {
      entityType: "PickleballEvent",
      entityId: eventId,
      action: "PICKLEBALL_SHARING_STOPPED",
      actorUserId,
      note: "Public link removed",
    });
  });
}

/** Replaces the link with a fresh one, keeping the same event — for a link that leaked or was shared too widely. */
export async function rotatePickleballLink(
  tournamentId: string,
  eventId: string,
  actorUserId: string
): Promise<{ token: string }> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { id: true, tournamentId: true, token: true },
  });
  if (!event || event.tournamentId !== tournamentId) throw new ValidationError("Pickleball event not found");
  if (!event.token) throw new ValidationError("There is no public link to replace — publish the schedule first");

  return prisma.$transaction(async (tx) => {
    const token = newToken();
    await tx.pickleballEvent.update({ where: { id: eventId }, data: { token } });
    await writeAuditLog(tx, {
      entityType: "PickleballEvent",
      entityId: eventId,
      action: "PICKLEBALL_LINK_ROTATED",
      actorUserId,
      note: "Old link no longer works",
    });
    return { token };
  });
}

/** The eventId a published token points at, or null for an unknown/unpublished
 * token — the thin lookup server.ts's public socket join handler needs. */
export async function getPickleballEventIdForToken(token: string): Promise<string | null> {
  const event = await prisma.pickleballEvent.findUnique({ where: { token }, select: { id: true, publishedAt: true } });
  return event && event.publishedAt ? event.id : null;
}

export type PublicPickleballEvent = {
  leagueId: string;
  leagueName: string;
  hasLeagueLogo: boolean;
  tournamentName: string;
  publishedAt: Date | null;
  matches: PickleballMatchView[];
  standings: PickleballStandingsRowView[];
};

/**
 * The public read path — looked up by unguessable token alone. Like
 * getPublicTournamentStats/getSharedRosterCard, this is an intentionally-
 * unauthenticated data path: do not add a session/role guard here or in its
 * caller. Selects only what the page shows — never the original file bytes,
 * uploader, or ids beyond what the page needs to render.
 */
export async function getPublicPickleballEvent(token: string): Promise<PublicPickleballEvent | null> {
  const pointer = await prisma.pickleballEvent.findUnique({
    where: { token },
    select: {
      id: true,
      publishedAt: true,
      tournament: { select: { name: true, leagueId: true, league: { select: { name: true, logo: { select: { id: true } } } } } },
    },
  });
  if (!pointer || !pointer.publishedAt) return null;

  const loaded = await loadEventCore(pointer.id);
  if (!loaded) return null;
  const { matches, standings } = toEventView(loaded);

  return {
    leagueId: loaded.tournament.leagueId,
    leagueName: pointer.tournament.league.name,
    hasLeagueLogo: pointer.tournament.league.logo !== null,
    tournamentName: pointer.tournament.name,
    publishedAt: pointer.publishedAt,
    matches,
    standings,
  };
}
