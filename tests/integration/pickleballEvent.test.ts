import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { buildPickleballFixture, basicSchedule } from "../helpers/pickleballFixtures";
import { expectAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import {
  createPickleballEvent,
  savePickleballSchedule,
  getPickleballEventForAdmin,
  getPickleballScheduleFile,
  publishPickleballEvent,
  stopSharingPickleball,
  rotatePickleballLink,
  deletePickleballEvent,
  getPickleballEventIdForToken,
  getPublicPickleballEvent,
} from "@/lib/services/pickleballEvent.service";
import { enterGameScore } from "@/lib/services/pickleballScoring.service";

beforeEach(resetDb);

const fileBytes = () => new Uint8Array([1, 2, 3, 4]);

describe("createPickleballEvent", () => {
  it("requires a completed auction on the same tournament", async () => {
    const { fx, auction, adminId } = await buildPickleballFixture();
    // Auction is COMPLETED in the fixture — rejecting a fresh, uncompleted one instead
    const otherAuction = await prisma.auction.create({
      data: {
        tournamentId: fx.tournament.id,
        name: "Not done",
        teamBudget: 500,
        createdById: adminId,
        status: "CREATED",
      },
    });
    await expect(createPickleballEvent(fx.tournament.id, otherAuction.id, adminId)).rejects.toThrow(
      "Choose a completed auction"
    );

    const created = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    expect(created.id).toBeTruthy();
    await expectAuditLog({ entityType: "PickleballEvent", entityId: created.id, action: "PICKLEBALL_EVENT_CREATED", actorUserId: adminId });
  });

  it("rejects an auction that belongs to a different tournament", async () => {
    const { fx: fx1, adminId } = await buildPickleballFixture();
    const { auction: otherAuction } = await buildPickleballFixture();
    await expect(createPickleballEvent(fx1.tournament.id, otherAuction.id, adminId)).rejects.toThrow("not found");
  });

  it("allows only one event per tournament", async () => {
    const { fx, auction, adminId } = await buildPickleballFixture();
    await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await expect(createPickleballEvent(fx.tournament.id, auction.id, adminId)).rejects.toThrow("already has a pickleball event");
  });
});

describe("savePickleballSchedule", () => {
  it("persists teams, matches and blank games, and audits", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    const schedule = basicSchedule(teamByName);

    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "schedule.xlsx", mimeType: "application/vnd.ms-excel", fileBytes: fileBytes(), ...schedule }, adminId);

    const admin = await getPickleballEventForAdmin(fx.tournament.id);
    expect(admin!.hasSchedule).toBe(true);
    expect(admin!.matches).toHaveLength(2);
    expect(admin!.matches[0].games).toHaveLength(3);
    expect(admin!.standings).toHaveLength(4);
    expect(admin!.standings.every((r) => r.matchesPlayed === 0)).toBe(true);
    expect(admin!.anyGameDataEntered).toBe(false);

    await expectAuditLog({ entityType: "PickleballEvent", entityId: event.id, action: "PICKLEBALL_SCHEDULE_UPLOADED", actorUserId: adminId });
  });

  it("rejects a team not in the tournament", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    const schedule = basicSchedule(teamByName);
    schedule.teams[0] = { teamId: "not-a-real-team", group: "A" };

    await expect(
      savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s.xlsx", mimeType: "x", fileBytes: fileBytes(), ...schedule }, adminId)
    ).rejects.toThrow("not part of this tournament");
  });

  it("allows a re-upload before any score is entered", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    const schedule = basicSchedule(teamByName);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s1.xlsx", mimeType: "x", fileBytes: fileBytes(), ...schedule }, adminId);

    const changed = { ...schedule, matches: [{ ...schedule.matches[0], gamesToPlay: 5 }] };
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s2.xlsx", mimeType: "x", fileBytes: fileBytes(), ...changed }, adminId);

    const admin = await getPickleballEventForAdmin(fx.tournament.id);
    expect(admin!.matches).toHaveLength(1);
    expect(admin!.matches[0].games).toHaveLength(5);
    expect(admin!.fileName).toBe("s2.xlsx");
  });

  it("rejects a re-upload once a game has been scored", async () => {
    const { fx, auction, adminId, teamByName, playerByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    const schedule = basicSchedule(teamByName);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s1.xlsx", mimeType: "x", fileBytes: fileBytes(), ...schedule }, adminId);

    const [game] = await prisma.pickleballGame.findMany({ where: { match: { eventId: event.id, matchNumber: 1 } }, orderBy: { gameNumber: "asc" } });
    await enterGameScore(
      fx.tournament.id,
      game.id,
      {
        team1Player1Id: playerByName.get("Alpha Player 1")!.id,
        team1Player2Id: playerByName.get("Alpha Player 2")!.id,
        team2Player1Id: playerByName.get("Beta Player 1")!.id,
        team2Player2Id: playerByName.get("Beta Player 2")!.id,
        team1Score: 11,
        team2Score: 5,
      },
      adminId
    );

    await expect(
      savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s2.xlsx", mimeType: "x", fileBytes: fileBytes(), ...schedule }, adminId)
    ).rejects.toThrow("Players or scores have already been entered");
  });

  it("rejects a re-upload once a game's players have been saved without a score", async () => {
    const { fx, auction, adminId, teamByName, playerByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    const schedule = basicSchedule(teamByName);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s1.xlsx", mimeType: "x", fileBytes: fileBytes(), ...schedule }, adminId);

    const [game] = await prisma.pickleballGame.findMany({ where: { match: { eventId: event.id, matchNumber: 1 } }, orderBy: { gameNumber: "asc" } });
    await enterGameScore(
      fx.tournament.id,
      game.id,
      {
        team1Player1Id: playerByName.get("Alpha Player 1")!.id,
        team1Player2Id: playerByName.get("Alpha Player 2")!.id,
        team2Player1Id: playerByName.get("Beta Player 1")!.id,
        team2Player2Id: playerByName.get("Beta Player 2")!.id,
        team1Score: null,
        team2Score: null,
      },
      adminId
    );

    await expect(
      savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s2.xlsx", mimeType: "x", fileBytes: fileBytes(), ...schedule }, adminId)
    ).rejects.toThrow("Players or scores have already been entered");
  });
});

describe("getPickleballScheduleFile", () => {
  it("returns the original bytes, scoped to the right tournament", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s.xlsx", mimeType: "app/x", fileBytes: fileBytes(), ...basicSchedule(teamByName) }, adminId);

    const file = await getPickleballScheduleFile(fx.tournament.id, event.id);
    expect(file!.fileName).toBe("s.xlsx");
    expect([...file!.data]).toEqual([1, 2, 3, 4]);

    const { fx: otherFx } = await buildPickleballFixture();
    expect(await getPickleballScheduleFile(otherFx.tournament.id, event.id)).toBeNull();
  });
});

describe("publish / stop sharing / rotate", () => {
  it("mints a token idempotently, never leaked into the audit log", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await expect(publishPickleballEvent(fx.tournament.id, event.id, adminId)).rejects.toThrow("Upload a schedule");

    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s.xlsx", mimeType: "x", fileBytes: fileBytes(), ...basicSchedule(teamByName) }, adminId);
    const first = await publishPickleballEvent(fx.tournament.id, event.id, adminId);
    const second = await publishPickleballEvent(fx.tournament.id, event.id, adminId);
    expect(second.token).toBe(first.token);
    expect(first.token.length).toBeGreaterThanOrEqual(32);

    const rows = await prisma.auditLog.findMany({ where: { entityType: "PickleballEvent", entityId: event.id, action: "PICKLEBALL_PUBLISHED" } });
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(first.token);
  });

  it("stop sharing 404s the public read; rotate breaks the old link and mints a new one", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s.xlsx", mimeType: "x", fileBytes: fileBytes(), ...basicSchedule(teamByName) }, adminId);
    const { token } = await publishPickleballEvent(fx.tournament.id, event.id, adminId);

    expect(await getPickleballEventIdForToken(token)).toBe(event.id);
    expect(await getPublicPickleballEvent(token)).not.toBeNull();

    const rotated = await rotatePickleballLink(fx.tournament.id, event.id, adminId);
    expect(rotated.token).not.toBe(token);
    expect(await getPublicPickleballEvent(token)).toBeNull();
    expect(await getPublicPickleballEvent(rotated.token)).not.toBeNull();

    await stopSharingPickleball(fx.tournament.id, event.id, adminId);
    expect(await getPublicPickleballEvent(rotated.token)).toBeNull();
  });

  it("rotate without a publish first is rejected", async () => {
    const { fx, auction, adminId } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await expect(rotatePickleballLink(fx.tournament.id, event.id, adminId)).rejects.toThrow("no public link");
  });
});

describe("getPublicPickleballEvent", () => {
  it("returns null for an unknown token", async () => {
    expect(await getPublicPickleballEvent("nope-not-a-token")).toBeNull();
  });

  it("never includes the original file, uploader, or any id-shaped keys beyond what the page renders", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "secret-name.xlsx", mimeType: "x", fileBytes: fileBytes(), ...basicSchedule(teamByName) }, adminId);
    const { token } = await publishPickleballEvent(fx.tournament.id, event.id, adminId);

    const publicView = await getPublicPickleballEvent(token);
    const json = JSON.stringify(publicView);
    expect(json).not.toContain("secret-name.xlsx");
    expect(json).not.toContain(adminId);
    expect(publicView!.standings).toHaveLength(4);
  });
});

describe("deletePickleballEvent", () => {
  it("removes the event, its teams/matches/games, and audits — works whether or not scoring has started", async () => {
    const { fx, auction, adminId, teamByName, playerByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s.xlsx", mimeType: "x", fileBytes: fileBytes(), ...basicSchedule(teamByName) }, adminId);
    const [game] = await prisma.pickleballGame.findMany({ where: { match: { eventId: event.id, matchNumber: 1 } }, orderBy: { gameNumber: "asc" } });
    await enterGameScore(
      fx.tournament.id,
      game.id,
      {
        team1Player1Id: playerByName.get("Alpha Player 1")!.id,
        team1Player2Id: playerByName.get("Alpha Player 2")!.id,
        team2Player1Id: playerByName.get("Beta Player 1")!.id,
        team2Player2Id: playerByName.get("Beta Player 2")!.id,
        team1Score: 11,
        team2Score: 5,
      },
      adminId
    );

    await deletePickleballEvent(fx.tournament.id, event.id, adminId);

    expect(await prisma.pickleballEvent.findUnique({ where: { id: event.id } })).toBeNull();
    expect(await prisma.pickleballEventTeam.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.pickleballMatch.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.pickleballGame.count({ where: { id: game.id } })).toBe(0);
    await expectAuditLog({ entityType: "PickleballEvent", entityId: event.id, action: "PICKLEBALL_EVENT_DELETED", actorUserId: adminId });
  });

  it("breaks the public link", async () => {
    const { fx, auction, adminId, teamByName } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    await savePickleballSchedule(fx.tournament.id, event.id, { fileName: "s.xlsx", mimeType: "x", fileBytes: fileBytes(), ...basicSchedule(teamByName) }, adminId);
    const { token } = await publishPickleballEvent(fx.tournament.id, event.id, adminId);

    await deletePickleballEvent(fx.tournament.id, event.id, adminId);
    expect(await getPublicPickleballEvent(token)).toBeNull();
  });

  it("rejects an event belonging to a different tournament", async () => {
    const { fx, auction, adminId } = await buildPickleballFixture();
    const event = await createPickleballEvent(fx.tournament.id, auction.id, adminId);
    const { fx: otherFx } = await buildPickleballFixture();
    await expect(deletePickleballEvent(otherFx.tournament.id, event.id, adminId)).rejects.toThrow("not found");
  });
});
