import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/services/auditLog.service";
import { emitPickleballEvent } from "@/server/ws/broadcaster";

async function loadGameForScoring(tournamentId: string, gameId: string) {
  const game = await prisma.pickleballGame.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      gameNumber: true,
      team1Player1Id: true,
      team1Player2Id: true,
      team2Player1Id: true,
      team2Player2Id: true,
      team1Score: true,
      team2Score: true,
      match: {
        select: {
          id: true,
          eventId: true,
          team1Id: true,
          team2Id: true,
          event: { select: { tournamentId: true, auctionId: true } },
        },
      },
    },
  });
  if (!game || game.match.event.tournamentId !== tournamentId) throw new ValidationError("Game not found");
  return game;
}

/** The Player ids this team's own roster from `auctionId` actually won — the
 * only players a game's dropdown for that side may pick, same query shape as
 * rosterCardShare.service.ts's playersWon. */
async function rosterPlayerIds(teamId: string, auctionId: string): Promise<Set<string>> {
  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { teamId_auctionId: { teamId, auctionId } },
    select: { playersWon: { select: { playerId: true } } },
  });
  return new Set((entry?.playersWon ?? []).map((p) => p.playerId));
}

export type EnterGameScoreInput = {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  /** Both null records the lineup with no result yet (a scorer can set who's
   * playing before the game finishes); both must otherwise be provided —
   * one score with no other isn't a valid state. */
  team1Score: number | null;
  team2Score: number | null;
};

/**
 * Records one game's players and, optionally, its score — the 4 players can
 * be saved on their own (e.g. before a game starts) and the score added or
 * changed later by calling this again. A real pickleball game can't tie, so
 * equal scores are rejected outright when both are given (no Excel-style
 * "Tie" text); picking the same player for both of one team's slots is
 * rejected the same way. Every player id must belong to that side's own
 * roster from the event's auction. Broadcasts to every open admin scoring
 * console and public/OBS view for this event after the write commits.
 */
export async function enterGameScore(
  tournamentId: string,
  gameId: string,
  input: EnterGameScoreInput,
  actorUserId: string
): Promise<void> {
  const game = await loadGameForScoring(tournamentId, gameId);

  const bothScoresBlank = input.team1Score === null && input.team2Score === null;
  if (!bothScoresBlank && (input.team1Score === null || input.team2Score === null)) {
    throw new ValidationError("Enter both scores, or leave both blank to save just the players");
  }
  if (input.team1Score !== null && input.team2Score !== null) {
    const team1Score = input.team1Score;
    const team2Score = input.team2Score;
    for (const [label, score] of [
      ["Team 1", team1Score],
      ["Team 2", team2Score],
    ] as const) {
      if (!Number.isInteger(score) || score < 0) throw new ValidationError(`${label}'s score must be a whole number, 0 or more`);
    }
    if (team1Score === team2Score) throw new ValidationError("A game can't end in a tie");
  }
  if (input.team1Player1Id === input.team1Player2Id) throw new ValidationError("Team 1 needs two different players");
  if (input.team2Player1Id === input.team2Player2Id) throw new ValidationError("Team 2 needs two different players");

  const { auctionId } = game.match.event;
  const [team1Roster, team2Roster] = await Promise.all([
    rosterPlayerIds(game.match.team1Id, auctionId),
    rosterPlayerIds(game.match.team2Id, auctionId),
  ]);
  if (!team1Roster.has(input.team1Player1Id) || !team1Roster.has(input.team1Player2Id)) {
    throw new ValidationError("Team 1's players must be on that team's roster");
  }
  if (!team2Roster.has(input.team2Player1Id) || !team2Roster.has(input.team2Player2Id)) {
    throw new ValidationError("Team 2's players must be on that team's roster");
  }

  const before = { team1Score: game.team1Score, team2Score: game.team2Score };
  await prisma.$transaction(async (tx) => {
    await tx.pickleballGame.update({
      where: { id: gameId },
      data: {
        team1Player1Id: input.team1Player1Id,
        team1Player2Id: input.team1Player2Id,
        team2Player1Id: input.team2Player1Id,
        team2Player2Id: input.team2Player2Id,
        team1Score: input.team1Score,
        team2Score: input.team2Score,
        scoredById: actorUserId,
        scoredAt: new Date(),
      },
    });
    await writeAuditLog(tx, {
      entityType: "PickleballGame",
      entityId: gameId,
      auctionId,
      action: "PICKLEBALL_GAME_SCORED",
      actorUserId,
      before,
      after: { team1Score: input.team1Score, team2Score: input.team2Score },
    });
  });

  // After commit, never inside $transaction — same ordering as
  // bidding.service.ts's emitAuctionEvent calls.
  emitPickleballEvent(game.match.eventId, "pickleball:updated", { matchId: game.match.id });
}

/** Resets one game back to blank — courtside mis-entry is common. A no-op
 * (no audit row, no broadcast) if the game was already blank. Checks the
 * player fields too, not just the score — a lineup saved with no score yet
 * (see enterGameScore) is real, clearable state on its own. */
export async function clearGameScore(tournamentId: string, gameId: string, actorUserId: string): Promise<void> {
  const game = await loadGameForScoring(tournamentId, gameId);
  const alreadyBlank =
    game.team1Score === null &&
    game.team2Score === null &&
    game.team1Player1Id === null &&
    game.team1Player2Id === null &&
    game.team2Player1Id === null &&
    game.team2Player2Id === null;
  if (alreadyBlank) return;

  const before = { team1Score: game.team1Score, team2Score: game.team2Score };
  await prisma.$transaction(async (tx) => {
    await tx.pickleballGame.update({
      where: { id: gameId },
      data: {
        team1Player1Id: null,
        team1Player2Id: null,
        team2Player1Id: null,
        team2Player2Id: null,
        team1Score: null,
        team2Score: null,
        scoredById: null,
        scoredAt: null,
      },
    });
    await writeAuditLog(tx, {
      entityType: "PickleballGame",
      entityId: gameId,
      auctionId: game.match.event.auctionId,
      action: "PICKLEBALL_GAME_SCORE_CLEARED",
      actorUserId,
      before,
    });
  });

  emitPickleballEvent(game.match.eventId, "pickleball:updated", { matchId: game.match.id });
}

/**
 * Clears every game's players and score across the whole event, keeping the
 * schedule (teams, matches, groups, rounds) exactly as it is — the lighter
 * alternative to deletePickleballEvent when the schedule itself is fine and
 * only the entered results need to be wiped and re-entered. Also lifts
 * savePickleballSchedule's re-upload block, since that only looks at whether
 * any game currently has data.
 */
export async function resetPickleballScores(tournamentId: string, eventId: string, actorUserId: string): Promise<void> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: { id: true, tournamentId: true },
  });
  if (!event || event.tournamentId !== tournamentId) throw new ValidationError("Pickleball event not found");

  const { count } = await prisma.$transaction(async (tx) => {
    const result = await tx.pickleballGame.updateMany({
      where: { match: { eventId } },
      data: {
        team1Player1Id: null,
        team1Player2Id: null,
        team2Player1Id: null,
        team2Player2Id: null,
        team1Score: null,
        team2Score: null,
        scoredById: null,
        scoredAt: null,
      },
    });
    await writeAuditLog(tx, {
      entityType: "PickleballEvent",
      entityId: eventId,
      action: "PICKLEBALL_SCORES_RESET",
      actorUserId,
      note: `Reset ${result.count} game${result.count === 1 ? "" : "s"} back to blank`,
    });
    return result;
  });

  if (count > 0) emitPickleballEvent(eventId, "pickleball:updated", { reset: true });
}

export type ScoringGameView = {
  id: string;
  gameNumber: number;
  team1Player1Id: string | null;
  team1Player2Id: string | null;
  team2Player1Id: string | null;
  team2Player2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
};
export type ScoringMatchView = {
  id: string;
  matchNumber: number;
  round: string;
  court: string | null;
  group: string;
  team1Id: string;
  team1Name: string;
  team1Roster: { id: string; name: string }[];
  team2Id: string;
  team2Name: string;
  team2Roster: { id: string; name: string }[];
  games: ScoringGameView[];
};

/** Every match of an event with its games and, per side, the roster the
 * scoring form's player dropdowns should offer. Empty for an unknown event or
 * one that doesn't belong to `tournamentId`. */
export async function getMatchesForScoring(tournamentId: string, eventId: string): Promise<ScoringMatchView[]> {
  const event = await prisma.pickleballEvent.findUnique({
    where: { id: eventId },
    select: {
      tournamentId: true,
      auctionId: true,
      matches: {
        select: {
          id: true,
          matchNumber: true,
          round: true,
          court: true,
          group: true,
          team1Id: true,
          team1: { select: { name: true } },
          team2Id: true,
          team2: { select: { name: true } },
          games: {
            select: {
              id: true,
              gameNumber: true,
              team1Player1Id: true,
              team1Player2Id: true,
              team2Player1Id: true,
              team2Player2Id: true,
              team1Score: true,
              team2Score: true,
            },
            orderBy: { gameNumber: "asc" },
          },
        },
        orderBy: [{ matchNumber: "asc" }],
      },
    },
  });
  if (!event || event.tournamentId !== tournamentId) return [];

  const teamIds = new Set<string>();
  for (const m of event.matches) {
    teamIds.add(m.team1Id);
    teamIds.add(m.team2Id);
  }
  const entries = await prisma.teamAuctionEntry.findMany({
    where: { auctionId: event.auctionId, teamId: { in: [...teamIds] } },
    select: {
      teamId: true,
      playersWon: { select: { player: { select: { id: true, name: true } } }, orderBy: { player: { name: "asc" } } },
    },
  });
  const rosterByTeam = new Map(entries.map((e) => [e.teamId, e.playersWon.map((p) => p.player)]));

  return event.matches.map((m) => ({
    id: m.id,
    matchNumber: m.matchNumber,
    round: m.round,
    court: m.court,
    group: m.group,
    team1Id: m.team1Id,
    team1Name: m.team1.name,
    team1Roster: rosterByTeam.get(m.team1Id) ?? [],
    team2Id: m.team2Id,
    team2Name: m.team2.name,
    team2Roster: rosterByTeam.get(m.team2Id) ?? [],
    games: m.games,
  }));
}
