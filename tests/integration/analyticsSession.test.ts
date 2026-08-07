import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureAdmin, createFixtureLeague, createFixtureManager } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  createAnalyticsSession,
  touchSession,
  recordLogin,
  getLoginSummary,
  getTimeSpentSummary,
} from "@/lib/services/analytics.service";

beforeEach(resetDb);

/**
 * Regression coverage for the inflated "Total time" bug: activeMs must
 * accumulate real elapsed time between heartbeats, capped so a multi-day
 * gap between visits on the same login (JWT sessions persist for weeks)
 * doesn't count as active time, unlike the old lastSeenAt - startedAt math.
 */
describe("touchSession activeMs accumulation", () => {
  it("adds the full gap when it's under the 2-minute cap", async () => {
    const user = await createFixtureAdmin();
    const session = await createAnalyticsSession(user.id);

    // Simulate the previous heartbeat having landed 30s ago.
    await prisma.analyticsSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - 30_000) },
    });

    await touchSession(session.id);

    const updated = await prisma.analyticsSession.findUniqueOrThrow({ where: { id: session.id } });
    // Allow some slack for real time elapsed while the test itself ran.
    expect(updated.activeMs).toBeGreaterThanOrEqual(29_000);
    expect(updated.activeMs).toBeLessThan(35_000);
  });

  it("caps the added amount at 2 minutes when the gap is much larger (a closed tab, not active browsing)", async () => {
    const user = await createFixtureAdmin();
    const session = await createAnalyticsSession(user.id);

    // Simulate a stale session from 3 days ago being touched again — this is
    // exactly the scenario that used to inflate "Total time" into days.
    await prisma.analyticsSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });

    await touchSession(session.id);

    const updated = await prisma.analyticsSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.activeMs).toBeLessThanOrEqual(2 * 60_000);
  });

  it("accumulates across multiple heartbeats rather than overwriting", async () => {
    const user = await createFixtureAdmin();
    const session = await createAnalyticsSession(user.id);

    await prisma.analyticsSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - 10_000) },
    });
    await touchSession(session.id);

    await prisma.analyticsSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - 10_000) },
    });
    await touchSession(session.id);

    const updated = await prisma.analyticsSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.activeMs).toBeGreaterThanOrEqual(19_000);
  });

  it("silently no-ops for an unknown session id (best-effort analytics, never throws)", async () => {
    await expect(touchSession("does-not-exist")).resolves.toBeUndefined();
  });
});

/**
 * Coverage for surfacing each user's league in the analytics dashboard —
 * both summaries join through User.league, and a league-less user (e.g. a
 * site ADMIN, which has no leagueId) must show up with a null league rather
 * than breaking the join.
 */
describe("league surfaced in analytics summaries", () => {
  it("getLoginSummary includes the logging-in user's league name", async () => {
    const league = await createFixtureLeague();
    const manager = await createFixtureManager(league.id);
    await recordLogin({ userId: manager.id });

    const { items } = await getLoginSummary();
    const event = items.find((e) => e.user.id === manager.id);
    expect(event?.user.league?.name).toBe(league.name);
  });

  it("getLoginSummary reports a null league for a user with no league (e.g. a site admin)", async () => {
    const admin = await createFixtureAdmin();
    await recordLogin({ userId: admin.id });

    const { items } = await getLoginSummary();
    const event = items.find((e) => e.user.id === admin.id);
    expect(event?.user.league).toBeNull();
  });

  it("getTimeSpentSummary includes the user's league name", async () => {
    const league = await createFixtureLeague();
    const manager = await createFixtureManager(league.id);
    await createAnalyticsSession(manager.id);

    const { items } = await getTimeSpentSummary();
    const row = items.find((r) => r.userId === manager.id);
    expect(row?.leagueName).toBe(league.name);
  });
});
