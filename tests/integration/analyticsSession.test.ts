import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createFixtureAdmin } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAnalyticsSession, touchSession } from "@/lib/services/analytics.service";

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
