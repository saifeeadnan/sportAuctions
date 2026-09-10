import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import {
  createFixtureLeague,
  createFixtureAdmin,
  createFixtureRoster,
  createFixtureUserWithMembership,
} from "../helpers/fixtures";
import { expectAuditLog } from "../helpers/auditLog";
import { prisma } from "@/lib/prisma";
import {
  upsertSeedingWindow,
  getSeedingEligibility,
  submitSeeds,
  getSeedingSummary,
  getSeedingSheet,
  finalizeSeeding,
} from "@/lib/services/playerSeeding.service";

beforeEach(resetDb);

const PLAYER_NAMES = ["Alpha Player", "Beta Player", "Cara Player", "Dev Player"];
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
// A window that already opened AND closed, entirely in the past (so its
// status is "closed" right now) needs two distinct past timestamps —
// opensAt === closesAt is itself invalid ("close after open").
const PAST_OPEN = new Date(Date.now() - 72 * 60 * 60 * 1000);
const PAST_CLOSE = PAST;
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const FAR_FUTURE = new Date(Date.now() + 48 * 60 * 60 * 1000);

/**
 * A league with a 4-player roster and three VIEWER members whose loginId is
 * copied (mixed-case, to exercise the case-insensitive self-match) onto the
 * first three players — Alice ↔ Alpha, Bob ↔ Beta, Cara ↔ Cara. "Dev Player"
 * has no matching member. Also one member NOT on the roster, and one on the
 * roster with an inactive membership.
 */
async function buildFixture() {
  const league = await createFixtureLeague();
  const admin = await createFixtureAdmin();
  const { roster, players } = await createFixtureRoster(league.id, admin.id, PLAYER_NAMES);
  const byName = (name: string) => players.find((p) => p.name === name)!;

  const alice = await createFixtureUserWithMembership(league.id, "VIEWER");
  const bob = await createFixtureUserWithMembership(league.id, "VIEWER");
  const cara = await createFixtureUserWithMembership(league.id, "VIEWER");
  const outsider = await createFixtureUserWithMembership(league.id, "VIEWER");
  const inactiveMember = await createFixtureUserWithMembership(league.id, "VIEWER", {
    membershipActive: false,
  });

  // Mixed-case on write to exercise the case-insensitive match at read time.
  await prisma.player.update({
    where: { id: byName("Alpha Player").id },
    data: { loginId: alice.user.loginId.toUpperCase() },
  });
  await prisma.player.update({ where: { id: byName("Beta Player").id }, data: { loginId: bob.user.loginId } });
  await prisma.player.update({ where: { id: byName("Cara Player").id }, data: { loginId: cara.user.loginId } });
  await prisma.player.update({
    where: { id: byName("Dev Player").id },
    data: { loginId: inactiveMember.user.loginId },
  });

  return {
    league,
    admin,
    roster,
    players,
    alice: alice.user,
    bob: bob.user,
    cara: cara.user,
    outsider: outsider.user,
    inactiveMember: inactiveMember.user,
    byName,
  };
}

describe("upsertSeedingWindow", () => {
  it("rejects a close date at or before the open date", async () => {
    const { roster, admin } = await buildFixture();
    await expect(
      upsertSeedingWindow(roster.id, { opensAt: FUTURE, closesAt: FUTURE, maxSeed: 10 }, admin.id)
    ).rejects.toThrow(/after the open date/);
  });

  it("rejects a maxSeed outside [2, 20]", async () => {
    const { roster, admin } = await buildFixture();
    await expect(
      upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 1 }, admin.id)
    ).rejects.toThrow(/between 2 and 20/);
    await expect(
      upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 21 }, admin.id)
    ).rejects.toThrow(/between 2 and 20/);
  });

  it("rejects opening a window on a read-only (ended) league", async () => {
    const { league, roster, admin } = await buildFixture();
    await prisma.league.update({ where: { id: league.id }, data: { endDate: PAST } });
    await expect(
      upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id)
    ).rejects.toThrow(/read-only/);
  });

  it("is idempotent-editable and audits open vs. update differently", async () => {
    const { roster, admin } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);
    await expectAuditLog({ entityType: "PlayerRoster", entityId: roster.id, action: "SEEDING_WINDOW_OPENED" });

    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FAR_FUTURE, maxSeed: 10 }, admin.id);
    await expectAuditLog({ entityType: "PlayerRoster", entityId: roster.id, action: "SEEDING_WINDOW_UPDATED" });

    const window = await prisma.playerSeedingWindow.findUniqueOrThrow({ where: { rosterId: roster.id } });
    expect(window.closesAt.getTime()).toBe(FAR_FUTURE.getTime());
  });

  it("rejects changing maxSeed once submissions exist", async () => {
    const { roster, admin, alice, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);
    await submitSeeds(roster.id, alice.id, null, [{ playerId: byName("Beta Player").id, seed: 3 }]);

    await expect(
      upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FAR_FUTURE, maxSeed: 5 }, admin.id)
    ).rejects.toThrow(/Max seed can't be changed/);
  });

  it("rejects editing an already-finalized window", async () => {
    const { roster, admin, players } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST_OPEN, closesAt: PAST_CLOSE, maxSeed: 10 }, admin.id);
    await finalizeSeeding(roster.id, players.map((p) => p.id), admin.id);

    await expect(
      upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id)
    ).rejects.toThrow(/already been finalized/);
  });
});

describe("getSeedingEligibility", () => {
  it("is eligible for a member on the roster, ineligible for one not on it, one with an inactive membership, and one out of scope", async () => {
    const { league, roster, admin, alice, outsider, inactiveMember } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);

    const eligible = await getSeedingEligibility(roster.id, alice.id, [league.id]);
    expect(eligible.eligible).toBe(true);

    const notOnRoster = await getSeedingEligibility(roster.id, outsider.id, [league.id]);
    expect(notOnRoster).toMatchObject({ eligible: false, reason: expect.stringContaining("aren't on this roster") });

    // Inactive membership never reaches session.user.memberships, so callers
    // would never pass this league in leagueIds for this user — simulate
    // that exact real-world shape (leagueIds excludes it), not a raw self-
    // match bypass.
    const inactiveScoped = await getSeedingEligibility(roster.id, inactiveMember.id, []);
    expect(inactiveScoped).toMatchObject({ eligible: false, reason: "Roster not found" });

    const wrongLeague = await getSeedingEligibility(roster.id, alice.id, ["some-other-league"]);
    expect(wrongLeague).toMatchObject({ eligible: false, reason: "Roster not found" });
  });
});

describe("submitSeeds", () => {
  it("rejects submitting while scheduled or closed", async () => {
    const { roster, alice, admin, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: FUTURE, closesAt: FAR_FUTURE, maxSeed: 10 }, admin.id);
    await expect(
      submitSeeds(roster.id, alice.id, null, [{ playerId: byName("Beta Player").id, seed: 1 }])
    ).rejects.toThrow(/isn't open/);

    await upsertSeedingWindow(roster.id, { opensAt: PAST_OPEN, closesAt: PAST_CLOSE, maxSeed: 10 }, admin.id);
    await expect(
      submitSeeds(roster.id, alice.id, null, [{ playerId: byName("Beta Player").id, seed: 1 }])
    ).rejects.toThrow(/isn't open/);
  });

  it("rejects rating yourself, an out-of-range seed, a non-integer seed, and an unknown player", async () => {
    const { roster, alice, admin, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 5 }, admin.id);

    await expect(
      submitSeeds(roster.id, alice.id, null, [{ playerId: byName("Alpha Player").id, seed: 1 }])
    ).rejects.toThrow(/can't rate yourself/);
    await expect(
      submitSeeds(roster.id, alice.id, null, [{ playerId: byName("Beta Player").id, seed: 6 }])
    ).rejects.toThrow(/between 1 and 5/);
    await expect(
      submitSeeds(roster.id, alice.id, null, [{ playerId: byName("Beta Player").id, seed: 1.5 }])
    ).rejects.toThrow(/between 1 and 5/);
    await expect(submitSeeds(roster.id, alice.id, null, [{ playerId: "nope", seed: 1 }])).rejects.toThrow(
      /not found on this roster/
    );
  });

  it("fully replaces a rater's previous submission, including un-skipping/re-skipping a player", async () => {
    const { roster, alice, admin, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);

    await submitSeeds(roster.id, alice.id, null, [
      { playerId: byName("Beta Player").id, seed: 2 },
      { playerId: byName("Cara Player").id, seed: 5 },
      { playerId: byName("Dev Player").id, seed: 9 },
    ]);
    // Second call omits Dev — it must be removed, not left stale — and
    // changes Beta's score.
    await submitSeeds(roster.id, alice.id, null, [
      { playerId: byName("Beta Player").id, seed: 1 },
      { playerId: byName("Cara Player").id, seed: 5 },
    ]);

    const window = await prisma.playerSeedingWindow.findUniqueOrThrow({ where: { rosterId: roster.id } });
    const rows = await prisma.playerSeedSubmission.findMany({
      where: { windowId: window.id, raterUserId: alice.id },
      orderBy: { playerId: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.playerId === byName("Beta Player").id)?.seed).toBe(1);
    expect(rows.some((r) => r.playerId === byName("Dev Player").id)).toBe(false);
  });

  it("never writes an audit row — submissions stay anonymous", async () => {
    const { roster, alice, admin, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);
    await submitSeeds(roster.id, alice.id, null, [{ playerId: byName("Beta Player").id, seed: 1 }]);

    // Exactly one PlayerRoster audit row exists in total — the window-open
    // — proving the submission itself added none.
    const rows = await prisma.auditLog.findMany({ where: { entityType: "PlayerRoster" } });
    expect(rows).toHaveLength(1); // only the window-open row — nothing from the submission
    expect(rows[0].action).toBe("SEEDING_WINDOW_OPENED");
  });
});

describe("getSeedingSheet", () => {
  it("never exposes another rater's answers, only the caller's own", async () => {
    const { roster, alice, bob, admin, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);
    await submitSeeds(roster.id, bob.id, null, [{ playerId: byName("Alpha Player").id, seed: 4 }]);

    const sheet = await getSeedingSheet(roster.id, alice.id, null);
    expect(sheet.eligible).toBe(true);
    if (sheet.eligible && sheet.status !== "finalized") {
      // Alice excludes herself, and never sees Bob's rating of Alpha.
      expect(sheet.players.every((p) => p.playerId !== byName("Alpha Player").id)).toBe(true);
      const betaRow = sheet.players.find((p) => p.playerId === byName("Beta Player").id);
      expect(betaRow?.mySeed).toBeNull();
    }
  });
});

describe("getSeedingSummary", () => {
  it("computes correct averages, counts, participation, and never exposes a rater id or timestamp", async () => {
    const { roster, admin, alice, bob, cara, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);

    await submitSeeds(roster.id, alice.id, null, [
      { playerId: byName("Beta Player").id, seed: 1 },
      { playerId: byName("Cara Player").id, seed: 3 },
    ]);
    await submitSeeds(roster.id, bob.id, null, [
      { playerId: byName("Alpha Player").id, seed: 2 },
      { playerId: byName("Cara Player").id, seed: 3 },
    ]);
    // Cara doesn't rate (0 of her possible 3) — still counts toward "eligible".
    void cara;

    const summary = await getSeedingSummary(roster.id);
    expect(summary.participation).toEqual({ submitted: 2, eligible: 3 }); // alice, bob, cara are self-matched; dev's match is inactive

    const byId = Object.fromEntries(summary.rows.map((r) => [r.playerId, r]));
    expect(byId[byName("Cara Player").id]).toMatchObject({ avgSeed: 3, ratingCount: 2 });
    expect(byId[byName("Alpha Player").id]).toMatchObject({ avgSeed: 2, ratingCount: 1 });
    expect(byId[byName("Beta Player").id]).toMatchObject({ avgSeed: 1, ratingCount: 1 });
    expect(byId[byName("Dev Player").id]).toMatchObject({ avgSeed: null, ratingCount: 0 });

    const json = JSON.stringify(summary);
    expect(json).not.toContain(alice.id);
    expect(json).not.toContain(bob.id);
    expect(json.toLowerCase()).not.toContain("rateruserid");
  });

  it("returns a not-started summary before any window exists", async () => {
    const { roster } = await buildFixture();
    const summary = await getSeedingSummary(roster.id);
    expect(summary.status).toBe("not-started");
    expect(summary.window).toBeNull();
    expect(summary.rows).toHaveLength(4);
  });
});

describe("finalizeSeeding", () => {
  it("rejects finalizing a window that is still open or only scheduled", async () => {
    const { roster, admin, players } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST, closesAt: FUTURE, maxSeed: 10 }, admin.id);
    await expect(finalizeSeeding(roster.id, players.map((p) => p.id), admin.id)).rejects.toThrow(
      /can only be finalized/
    );

    await upsertSeedingWindow(roster.id, { opensAt: FUTURE, closesAt: FAR_FUTURE, maxSeed: 10 }, admin.id);
    await expect(finalizeSeeding(roster.id, players.map((p) => p.id), admin.id)).rejects.toThrow(
      /can only be finalized/
    );
  });

  it("requires exactly the roster's player set — rejects missing or extra ids", async () => {
    const { roster, admin, players } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST_OPEN, closesAt: PAST_CLOSE, maxSeed: 10 }, admin.id);

    await expect(
      finalizeSeeding(roster.id, players.slice(1).map((p) => p.id), admin.id)
    ).rejects.toThrow(/every player on the roster exactly once/);
    await expect(
      finalizeSeeding(roster.id, [...players.map((p) => p.id), "extra-id"], admin.id)
    ).rejects.toThrow(/every player on the roster exactly once/);
  });

  it("writes Player.seed 1..N in the given order, audits, and a re-finalize overwrites cleanly", async () => {
    const { roster, admin, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST_OPEN, closesAt: PAST_CLOSE, maxSeed: 10 }, admin.id);

    const order = [
      byName("Beta Player").id,
      byName("Alpha Player").id,
      byName("Cara Player").id,
      byName("Dev Player").id,
    ];
    await finalizeSeeding(roster.id, order, admin.id);

    let players = await prisma.player.findMany({ where: { rosterId: roster.id }, orderBy: { seed: "asc" } });
    expect(players.map((p) => p.id)).toEqual(order);
    expect(players.map((p) => p.seed)).toEqual([1, 2, 3, 4]);

    const row = await expectAuditLog({
      entityType: "PlayerRoster",
      entityId: roster.id,
      action: "SEEDING_FINALIZED",
      actorUserId: admin.id,
    });
    expect((row.after as { playerCount?: number }).playerCount).toBe(4);

    // Re-finalize with a different order overwrites cleanly.
    const reordered = [...order].reverse();
    await finalizeSeeding(roster.id, reordered, admin.id);
    players = await prisma.player.findMany({ where: { rosterId: roster.id }, orderBy: { seed: "asc" } });
    expect(players.map((p) => p.id)).toEqual(reordered);

    const window = await prisma.playerSeedingWindow.findUniqueOrThrow({ where: { rosterId: roster.id } });
    expect(window.finalizedAt).not.toBeNull();
    expect(window.finalizedById).toBe(admin.id);
  });

  it("publishes the final order to getSeedingSheet once finalized", async () => {
    const { roster, admin, alice, byName } = await buildFixture();
    await upsertSeedingWindow(roster.id, { opensAt: PAST_OPEN, closesAt: PAST_CLOSE, maxSeed: 10 }, admin.id);
    const order = [
      byName("Beta Player").id,
      byName("Alpha Player").id,
      byName("Cara Player").id,
      byName("Dev Player").id,
    ];
    await finalizeSeeding(roster.id, order, admin.id);

    const sheet = await getSeedingSheet(roster.id, alice.id, null);
    expect(sheet.eligible).toBe(true);
    if (sheet.eligible && sheet.status === "finalized") {
      expect(sheet.finalSeeding.map((r) => r.playerId)).toEqual(order);
      expect(sheet.finalSeeding.map((r) => r.seed)).toEqual([1, 2, 3, 4]);
    } else {
      throw new Error("expected a finalized sheet");
    }
  });
});
