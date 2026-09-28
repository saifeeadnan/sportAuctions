import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { buildPickleballFixture, basicSchedule } from "../helpers/pickleballFixtures";
import { expectAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import * as broadcaster from "@/server/ws/broadcaster";
import { createPickleballEvent, savePickleballSchedule, getPublicPickleballEvent, publishPickleballEvent } from "@/lib/services/pickleballEvent.service";
import {
  enterGameScore,
  clearGameScore,
  resetPickleballScores,
  getMatchesForScoring,
  type EnterGameScoreInput,
} from "@/lib/services/pickleballScoring.service";

beforeEach(resetDb);

async function setup() {
  const { fx, auction, adminId, teamByName, playerByName } = await buildPickleballFixture();
  const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
  await savePickleballSchedule(
    fx.tournament.id,
    event.id,
    { fileName: "s.xlsx", mimeType: "x", fileBytes: new Uint8Array([1]), ...basicSchedule(teamByName) },
    adminId
  );
  const games = await prisma.pickleballGame.findMany({
    where: { match: { eventId: event.id, matchNumber: 1 } },
    orderBy: { gameNumber: "asc" },
  });
  const input = (overrides: Partial<EnterGameScoreInput> = {}): EnterGameScoreInput => ({
    team1Player1Id: playerByName.get("Alpha Player 1")!.id,
    team1Player2Id: playerByName.get("Alpha Player 2")!.id,
    team2Player1Id: playerByName.get("Beta Player 1")!.id,
    team2Player2Id: playerByName.get("Beta Player 2")!.id,
    team1Score: 11,
    team2Score: 5,
    ...overrides,
  });
  return { fx, event, adminId, teamByName, playerByName, games, input };
}

describe("enterGameScore", () => {
  it("persists players and score, audits before/after, and broadcasts", async () => {
    const { fx, event, adminId, games, input } = await setup();
    const spy = vi.spyOn(broadcaster, "emitPickleballEvent");

    await enterGameScore(fx.tournament.id, games[0].id, input(), adminId);

    const saved = await prisma.pickleballGame.findUniqueOrThrow({ where: { id: games[0].id } });
    expect(saved.team1Score).toBe(11);
    expect(saved.team2Score).toBe(5);
    expect(saved.scoredById).toBe(adminId);
    expect(saved.scoredAt).not.toBeNull();

    const row = await expectAuditLog({ entityType: "PickleballGame", entityId: games[0].id, action: "PICKLEBALL_GAME_SCORED", actorUserId: adminId });
    expect(row.before).toEqual({ team1Score: null, team2Score: null });
    expect(row.after).toEqual({ team1Score: 11, team2Score: 5 });

    expect(spy).toHaveBeenCalledWith(event.id, "pickleball:updated", expect.objectContaining({ matchId: expect.any(String) }));
  });

  it("rejects a tied score", async () => {
    const { fx, games, adminId, input } = await setup();
    await expect(enterGameScore(fx.tournament.id, games[0].id, input({ team1Score: 8, team2Score: 8 }), adminId)).rejects.toThrow(
      "can't end in a tie"
    );
  });

  it("saves just the players with both scores left blank", async () => {
    const { fx, games, adminId, input } = await setup();
    await enterGameScore(fx.tournament.id, games[0].id, input({ team1Score: null, team2Score: null }), adminId);

    const saved = await prisma.pickleballGame.findUniqueOrThrow({ where: { id: games[0].id } });
    expect(saved.team1Score).toBeNull();
    expect(saved.team2Score).toBeNull();
    expect(saved.team1Player1Id).not.toBeNull();
    expect(saved.scoredById).toBe(adminId);
  });

  it("adding the score later, on top of an already-saved lineup, succeeds", async () => {
    const { fx, games, adminId, input } = await setup();
    await enterGameScore(fx.tournament.id, games[0].id, input({ team1Score: null, team2Score: null }), adminId);
    await enterGameScore(fx.tournament.id, games[0].id, input(), adminId);

    const saved = await prisma.pickleballGame.findUniqueOrThrow({ where: { id: games[0].id } });
    expect(saved.team1Score).toBe(11);
    expect(saved.team2Score).toBe(5);
  });

  it("rejects providing only one of the two scores", async () => {
    const { fx, games, adminId, input } = await setup();
    await expect(enterGameScore(fx.tournament.id, games[0].id, input({ team2Score: null }), adminId)).rejects.toThrow(
      "Enter both scores, or leave both blank"
    );
  });

  it("still enforces duplicate-player and roster checks when scores are left blank", async () => {
    const { fx, games, adminId, playerByName, input } = await setup();
    await expect(
      enterGameScore(
        fx.tournament.id,
        games[0].id,
        input({ team1Score: null, team2Score: null, team1Player2Id: playerByName.get("Alpha Player 1")!.id }),
        adminId
      )
    ).rejects.toThrow("Team 1 needs two different players");
    await expect(
      enterGameScore(
        fx.tournament.id,
        games[0].id,
        input({ team1Score: null, team2Score: null, team1Player1Id: playerByName.get("Gamma Player 1")!.id }),
        adminId
      )
    ).rejects.toThrow("Team 1's players must be on that team's roster");
  });

  it("rejects the same player filling both of one team's slots", async () => {
    const { fx, games, adminId, playerByName, input } = await setup();
    await expect(
      enterGameScore(fx.tournament.id, games[0].id, input({ team1Player2Id: playerByName.get("Alpha Player 1")!.id }), adminId)
    ).rejects.toThrow("Team 1 needs two different players");
  });

  it("rejects a player who isn't on that side's roster for this event's auction", async () => {
    const { fx, games, adminId, playerByName, input } = await setup();
    await expect(
      enterGameScore(fx.tournament.id, games[0].id, input({ team1Player1Id: playerByName.get("Gamma Player 1")!.id }), adminId)
    ).rejects.toThrow("Team 1's players must be on that team's roster");
  });

  it("rejects a negative or non-integer score", async () => {
    const { fx, games, adminId, input } = await setup();
    await expect(enterGameScore(fx.tournament.id, games[0].id, input({ team1Score: -1 }), adminId)).rejects.toThrow("whole number");
    await expect(enterGameScore(fx.tournament.id, games[0].id, input({ team2Score: 5.5 }), adminId)).rejects.toThrow("whole number");
  });

  it("rejects scoring a game whose event belongs to a different tournament", async () => {
    const { games, input, adminId } = await setup();
    const { fx: otherFx } = await buildPickleballFixture();
    await expect(enterGameScore(otherFx.tournament.id, games[0].id, input(), adminId)).rejects.toThrow("not found");
  });

  it("updates the live public standings once a game is decided", async () => {
    const { fx, event, adminId, games, input } = await setup();
    const { token } = await publishPickleballEvent(fx.tournament.id, event.id, adminId);
    await enterGameScore(fx.tournament.id, games[0].id, input(), adminId);
    await enterGameScore(fx.tournament.id, games[1].id, input({ team1Score: 11, team2Score: 3 }), adminId);

    const publicView = await getPublicPickleballEvent(token);
    const alpha = publicView!.standings.find((r) => r.teamName === "Alpha")!;
    expect(alpha.matchWins).toBe(1);
    expect(alpha.gamesWon).toBe(2);
  });
});

describe("clearGameScore", () => {
  it("resets a scored game back to blank and audits", async () => {
    const { fx, games, adminId, input } = await setup();
    await enterGameScore(fx.tournament.id, games[0].id, input(), adminId);

    await clearGameScore(fx.tournament.id, games[0].id, adminId);

    const saved = await prisma.pickleballGame.findUniqueOrThrow({ where: { id: games[0].id } });
    expect(saved.team1Score).toBeNull();
    expect(saved.team1Player1Id).toBeNull();
    expect(saved.scoredById).toBeNull();
    await expectAuditLog({ entityType: "PickleballGame", entityId: games[0].id, action: "PICKLEBALL_GAME_SCORE_CLEARED", actorUserId: adminId });
  });

  it("is a no-op for an already-blank game", async () => {
    const { fx, games, adminId } = await setup();
    await clearGameScore(fx.tournament.id, games[0].id, adminId);
    const count = await prisma.auditLog.count({ where: { entityType: "PickleballGame", action: "PICKLEBALL_GAME_SCORE_CLEARED" } });
    expect(count).toBe(0);
  });

  it("clears a lineup saved with no score yet — not a no-op just because the score is blank", async () => {
    const { fx, games, adminId, input } = await setup();
    await enterGameScore(fx.tournament.id, games[0].id, input({ team1Score: null, team2Score: null }), adminId);

    await clearGameScore(fx.tournament.id, games[0].id, adminId);

    const saved = await prisma.pickleballGame.findUniqueOrThrow({ where: { id: games[0].id } });
    expect(saved.team1Player1Id).toBeNull();
    expect(saved.team2Player2Id).toBeNull();
    await expectAuditLog({ entityType: "PickleballGame", entityId: games[0].id, action: "PICKLEBALL_GAME_SCORE_CLEARED", actorUserId: adminId });
  });
});

describe("resetPickleballScores", () => {
  it("clears every game's players/scores across the whole event, keeping the schedule", async () => {
    const { fx, event, adminId, games, input } = await setup();
    await enterGameScore(fx.tournament.id, games[0].id, input(), adminId);
    await enterGameScore(fx.tournament.id, games[1].id, input({ team1Score: null, team2Score: null }), adminId);

    await resetPickleballScores(fx.tournament.id, event.id, adminId);

    const allGames = await prisma.pickleballGame.findMany({ where: { match: { eventId: event.id } } });
    expect(allGames.length).toBeGreaterThan(0);
    for (const g of allGames) {
      expect(g.team1Score).toBeNull();
      expect(g.team2Score).toBeNull();
      expect(g.team1Player1Id).toBeNull();
      expect(g.scoredById).toBeNull();
    }
    // The schedule itself (teams, matches) is untouched.
    expect(await prisma.pickleballMatch.count({ where: { eventId: event.id } })).toBe(2);
    await expectAuditLog({ entityType: "PickleballEvent", entityId: event.id, action: "PICKLEBALL_SCORES_RESET", actorUserId: adminId });
  });

  it("un-blocks a schedule re-upload afterward", async () => {
    const { fx, event, adminId, teamByName, games, input } = await setup();
    await enterGameScore(fx.tournament.id, games[0].id, input(), adminId);
    await resetPickleballScores(fx.tournament.id, event.id, adminId);

    await expect(
      savePickleballSchedule(
        fx.tournament.id,
        event.id,
        { fileName: "s2.xlsx", mimeType: "x", fileBytes: new Uint8Array([1]), ...basicSchedule(teamByName) },
        adminId
      )
    ).resolves.not.toThrow();
  });

  it("rejects an event belonging to a different tournament", async () => {
    const { event, adminId } = await setup();
    const { fx: otherFx } = await buildPickleballFixture();
    await expect(resetPickleballScores(otherFx.tournament.id, event.id, adminId)).rejects.toThrow("not found");
  });
});

describe("getMatchesForScoring", () => {
  it("returns each match with its own side's roster from the event's auction", async () => {
    const { fx, event, teamByName } = await setup();
    const matches = await getMatchesForScoring(fx.tournament.id, event.id);
    expect(matches).toHaveLength(2);
    const first = matches.find((m) => m.team1Id === teamByName.get("Alpha")!.id)!;
    expect(first.team1Roster.map((p) => p.name).sort()).toEqual(["Alpha Player 1", "Alpha Player 2"]);
    expect(first.team2Roster.map((p) => p.name).sort()).toEqual(["Beta Player 1", "Beta Player 2"]);
    expect(first.games).toHaveLength(3);
  });

  it("returns an empty list for an unknown or mismatched event", async () => {
    const { event } = await setup();
    const { fx: otherFx } = await buildPickleballFixture();
    expect(await getMatchesForScoring(otherFx.tournament.id, event.id)).toEqual([]);
  });
});
