import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import {
  createAuction,
  openPreAuction,
  lockPreAuction,
  startBidding,
  updateOnClockDisplaySettings,
} from "@/lib/services/auction.service";
import { updateLeagueSettings } from "@/lib/services/league.service";
import { getAuctionState } from "@/lib/services/auctionState.service";

beforeEach(resetDb);

async function createTestAuction(fixture: Awaited<ReturnType<typeof createAuctionReadyFixture>>) {
  return createAuction({
    tournamentId: fixture.tournament.id,
    name: "On-Clock Display Settings Test Auction",
    teamBudget: 1000,
    createdById: fixture.admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: fixture.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
}

describe("updateOnClockDisplaySettings — happy path", () => {
  it("persists a valid template and visible-fields selection", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);

    await updateOnClockDisplaySettings(auction.id, {
      onClockTemplate: "STATS_TABLE",
      onClockVisibleFields: ["position", "age", "rating"],
    });

    const updated = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(updated.onClockTemplate).toBe("STATS_TABLE");
    expect(updated.onClockVisibleFields).toEqual(["position", "age", "rating"]);
  });

  it("succeeds while the auction status is BIDDING", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);
    await openPreAuction(auction.id);
    await lockPreAuction(auction.id, true);
    await startBidding(auction.id);

    await updateOnClockDisplaySettings(auction.id, { onClockTemplate: "PHOTO_FOCUS" });

    const updated = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(updated.status).toBe("BIDDING");
    expect(updated.onClockTemplate).toBe("PHOTO_FOCUS");
  });

  it("updates only the template, leaving visible fields untouched, and vice versa", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);

    await updateOnClockDisplaySettings(auction.id, { onClockVisibleFields: ["age"] });
    let updated = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(updated.onClockTemplate).toBe("CLASSIC");
    expect(updated.onClockVisibleFields).toEqual(["age"]);

    await updateOnClockDisplaySettings(auction.id, { onClockTemplate: "PHOTO_FOCUS" });
    updated = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(updated.onClockTemplate).toBe("PHOTO_FOCUS");
    expect(updated.onClockVisibleFields).toEqual(["age"]);
  });
});

describe("updateOnClockDisplaySettings — validation", () => {
  it("rejects an unknown template", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);

    await expect(
      updateOnClockDisplaySettings(auction.id, { onClockTemplate: "NOT_A_TEMPLATE" as never })
    ).rejects.toThrow(/Unknown on-the-clock template/);
  });

  it("rejects an unknown field key", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);

    await expect(
      updateOnClockDisplaySettings(auction.id, { onClockVisibleFields: ["notAField"] as never })
    ).rejects.toThrow(/Unknown display field\(s\): notAField/);
  });

  it("rejects when neither field is provided", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);

    await expect(updateOnClockDisplaySettings(auction.id, {})).rejects.toThrow(
      /template and\/or visible fields/
    );
  });
});

describe("updateOnClockDisplaySettings — read-only league", () => {
  it("rejects once the league becomes read-only", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);
    await updateLeagueSettings(fixture.league.id, { endDate: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    await expect(
      updateOnClockDisplaySettings(auction.id, { onClockTemplate: "PHOTO_FOCUS" })
    ).rejects.toThrow(/read-only/);
  });
});

describe("backward-compatible defaults", () => {
  it("an auction created without the new fields gets today's exact defaults, surfaced through getAuctionState", async () => {
    const fixture = await createAuctionReadyFixture({
      playerNames: ["Player A"],
      teamNames: ["Team 1"],
      squadSize: 5,
    });
    const auction = await createTestAuction(fixture);

    const dbRow = await prisma.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(dbRow.skipPreAuctionDraft).toBe(false);
    expect(dbRow.onClockTemplate).toBe("CLASSIC");
    expect(dbRow.onClockVisibleFields).toEqual(["photoUrl", "previousTeam"]);

    const state = await getAuctionState(auction.id);
    expect(state?.onClockTemplate).toBe("CLASSIC");
    expect(state?.onClockVisibleFields).toEqual(["photoUrl", "previousTeam"]);
    expect(state?.players[0].age).toBeNull();
  });
});
