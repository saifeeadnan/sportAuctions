import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { updateLeagueSettings } from "@/lib/services/league.service";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  updateScheduledStartAt,
} from "@/lib/services/auction.service";
import { concludeAuction } from "@/lib/services/bidding.service";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { expectAuditLog } from "../helpers/auditLog";

beforeEach(resetDb);

const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);

async function buildFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Player A"],
    teamNames: ["Team 1"],
    squadSize: 2,
  });
  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Test Auction",
    teamBudget: 1000,
    createdById: fx.admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
  return { ...fx, auction };
}

describe("updateScheduledStartAt", () => {
  it("rejects an invalid date", async () => {
    const fx = await buildFixture();
    await expect(
      updateScheduledStartAt(fx.auction.id, new Date("not-a-date"), fx.admin.id)
    ).rejects.toThrow(/Invalid date/);
  });

  it("rejects once the league is read-only", async () => {
    const fx = await buildFixture();
    await updateLeagueSettings(fx.league.id, { endDate: PAST });
    await expect(updateScheduledStartAt(fx.auction.id, FUTURE, fx.admin.id)).rejects.toThrow(
      /read-only/
    );
  });

  it("succeeds and audits SCHEDULED_START_CHANGED, reflected in getAuctionState", async () => {
    const fx = await buildFixture();
    const updated = await updateScheduledStartAt(fx.auction.id, FUTURE, fx.admin.id);
    expect(updated.scheduledStartAt?.getTime()).toBe(FUTURE.getTime());

    const log = await expectAuditLog({
      entityType: "Auction",
      entityId: fx.auction.id,
      action: "SCHEDULED_START_CHANGED",
      actorUserId: fx.admin.id,
    });
    expect(log.before).toMatchObject({ scheduledStartAt: null });
    expect(log.after).toMatchObject({ scheduledStartAt: FUTURE.toISOString() });

    const state = await getAuctionState(fx.auction.id);
    expect(state?.scheduledStartAt).toBe(FUTURE.toISOString());
  });

  it("clears with null", async () => {
    const fx = await buildFixture();
    await updateScheduledStartAt(fx.auction.id, FUTURE, fx.admin.id);
    const cleared = await updateScheduledStartAt(fx.auction.id, null, fx.admin.id);
    expect(cleared.scheduledStartAt).toBeNull();

    const state = await getAuctionState(fx.auction.id);
    expect(state?.scheduledStartAt).toBeNull();
  });

  it("succeeds any time before the auction concludes — CREATED, PRE_AUCTION_OPEN, and BIDDING", async () => {
    const fx = await buildFixture();
    await updateScheduledStartAt(fx.auction.id, FUTURE, fx.admin.id); // CREATED
    await openPreAuction(fx.auction.id, fx.admin.id);
    await updateScheduledStartAt(fx.auction.id, FUTURE, fx.admin.id); // PRE_AUCTION_OPEN
    await lockPreAuction(fx.auction.id, true, fx.admin.id);
    await startBidding(fx.auction.id, fx.admin.id);
    const updated = await updateScheduledStartAt(fx.auction.id, FUTURE, fx.admin.id); // BIDDING
    expect(updated.scheduledStartAt?.getTime()).toBe(FUTURE.getTime());
  });

  it("rejects once the auction has concluded", async () => {
    const fx = await buildFixture();
    await openPreAuction(fx.auction.id, fx.admin.id);
    await lockPreAuction(fx.auction.id, true, fx.admin.id);
    await startBidding(fx.auction.id, fx.admin.id);
    await concludeAuction(fx.auction.id, fx.admin.id);

    await expect(updateScheduledStartAt(fx.auction.id, FUTURE, fx.admin.id)).rejects.toThrow(
      /concluded/
    );
  });
});
