import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/resetDb";
import { createAuctionReadyFixture } from "../helpers/fixtures";
import { prisma } from "@/lib/prisma";
import { createAuction, openPreAuction, lockPreAuction, startBidding } from "@/lib/services/auction.service";
import { adminAssignPlayer } from "@/lib/services/bidding.service";
import { saveStrategy, upsertCategoryBudgetTarget } from "@/lib/services/auctionStrategy.service";
import { upsertRivalCategoryEstimate } from "@/lib/services/rivalCategoryEstimate.service";
import { savePrediction } from "@/lib/services/auctionPrediction.service";
import {
  saveCurrentAsStrategy,
  loadSavedStrategy,
  deleteSavedStrategy,
  getStrategyDirtyState,
  listSavedStrategies,
} from "@/lib/services/savedStrategy.service";

beforeEach(resetDb);

/** A live (BIDDING) two-team auction with two players — enough to set a
 * must-have/avoid, a budget target, a rival estimate, and a prediction
 * naming the other team as winner, same shape as auditLog.test.ts's own
 * analytics fixture. */
async function buildFixture() {
  const fx = await createAuctionReadyFixture({
    playerNames: ["Player One", "Player Two"],
    teamNames: ["Team 1", "Team 2"],
    squadSize: 2,
  });
  const auction = await createAuction({
    tournamentId: fx.tournament.id,
    name: "Auction",
    teamBudget: 1000,
    createdById: fx.admin.id,
    categories: [{ name: "Regular", basePrice: 100 }],
    playerAssignments: fx.players.map((p) => ({ playerId: p.id, categoryName: "Regular" })),
  });
  await openPreAuction(auction.id, fx.admin.id);
  await lockPreAuction(auction.id, true, fx.admin.id);
  await startBidding(auction.id, fx.admin.id);

  const [entry1, entry2] = await prisma.teamAuctionEntry.findMany({
    where: { auctionId: auction.id },
    include: { team: true },
    orderBy: { team: { name: "asc" } },
  });
  const category = await prisma.auctionCategory.findFirstOrThrow({ where: { auctionId: auction.id } });
  const playerOne = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: fx.players[0].id },
  });
  const playerTwo = await prisma.auctionPlayer.findFirstOrThrow({
    where: { auctionId: auction.id, playerId: fx.players[1].id },
  });

  return { ...fx, auction, entry1, entry2, category, playerOne, playerTwo };
}

/** Sets up a full real strategy for entry1: must-have playerOne, a budget
 * target, a rival estimate about entry2, and a prediction naming entry2 as
 * playerTwo's winner. */
async function setLiveStrategy(fx: Awaited<ReturnType<typeof buildFixture>>, actorId: string) {
  await saveStrategy(fx.entry1.id, [fx.playerOne.id], [], [{ categoryId: fx.category.id, targetAvgPrice: 150 }], actorId);
  await upsertRivalCategoryEstimate(fx.entry1.id, fx.entry2.id, fx.category.id, 300, actorId);
  await savePrediction(fx.entry1.id, fx.playerTwo.id, fx.entry2.id, 250, null, false, actorId);
}

describe("savedStrategy.service", () => {
  it("saveCurrentAsStrategy captures exact live state across all five facets and marks it active", async () => {
    const fx = await buildFixture();
    const actorId = fx.entry1.team.managerId!;
    await setLiveStrategy(fx, actorId);

    const { id } = await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

    const row = await prisma.savedAuctionStrategy.findUnique({ where: { id } });
    expect(row?.mustHaveIds).toEqual([fx.playerOne.id]);
    expect(row?.avoidIds).toEqual([]);
    expect(row?.budgetTargets).toEqual([{ categoryId: fx.category.id, targetAvgPrice: "150" }]);
    expect(row?.rivalEstimates).toEqual([
      { targetEntryId: fx.entry2.id, categoryId: fx.category.id, estimatedBudget: "300" },
    ]);
    expect(row?.predictions).toEqual([
      {
        playerId: fx.playerTwo.id,
        predictedWinnerEntryId: fx.entry2.id,
        predictedAmount: "250",
        predictedMinAmount: null,
        predictedUnsold: false,
      },
    ]);

    const updatedEntry = await prisma.teamAuctionEntry.findUnique({ where: { id: fx.entry1.id } });
    expect(updatedEntry?.activeSavedStrategyId).toBe(id);
  });

  it("saving under an existing name overwrites it rather than creating a second row", async () => {
    const fx = await buildFixture();
    const actorId = fx.entry1.team.managerId!;
    await setLiveStrategy(fx, actorId);
    const { id: firstId } = await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

    await upsertCategoryBudgetTarget(fx.entry1.id, fx.category.id, 999, actorId);
    const { id: secondId } = await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

    expect(secondId).toBe(firstId);
    const rows = await prisma.savedAuctionStrategy.findMany({ where: { teamAuctionEntryId: fx.entry1.id } });
    expect(rows).toHaveLength(1);
    expect((rows[0].budgetTargets as { targetAvgPrice: string }[])[0].targetAvgPrice).toBe("999");
  });

  it("loadSavedStrategy wipes-and-restores all five facets onto a changed live state", async () => {
    const fx = await buildFixture();
    const actorId = fx.entry1.team.managerId!;
    await setLiveStrategy(fx, actorId);
    const { id } = await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

    // Drift live state away from the saved snapshot in every facet.
    await saveStrategy(fx.entry1.id, [], [fx.playerOne.id], [], actorId);
    await upsertRivalCategoryEstimate(fx.entry1.id, fx.entry2.id, fx.category.id, null, actorId);
    await savePrediction(fx.entry1.id, fx.playerTwo.id, null, null, null, true, actorId);

    await loadSavedStrategy(fx.entry1.id, id, actorId);

    const [prefs, targets, estimates, predictions] = await Promise.all([
      prisma.auctionPlayerPreference.findMany({ where: { teamAuctionEntryId: fx.entry1.id } }),
      prisma.auctionCategoryBudgetTarget.findMany({ where: { teamAuctionEntryId: fx.entry1.id } }),
      prisma.rivalCategoryBudgetEstimate.findMany({ where: { teamAuctionEntryId: fx.entry1.id } }),
      prisma.auctionPlayerPrediction.findMany({ where: { teamAuctionEntryId: fx.entry1.id } }),
    ]);

    expect(prefs).toHaveLength(1);
    expect(prefs[0].auctionPlayerId).toBe(fx.playerOne.id);
    expect(prefs[0].type).toBe("MUST_HAVE");
    expect(targets).toHaveLength(1);
    expect(targets[0].targetAvgPrice.toString()).toBe("150");
    expect(estimates).toHaveLength(1);
    expect(estimates[0].estimatedBudget.toString()).toBe("300");
    expect(predictions).toHaveLength(1);
    expect(predictions[0].predictedWinnerEntryId).toBe(fx.entry2.id);
    expect(predictions[0].predictedAmount?.toString()).toBe("250");

    const updatedEntry = await prisma.teamAuctionEntry.findUnique({ where: { id: fx.entry1.id } });
    expect(updatedEntry?.activeSavedStrategyId).toBe(id);
  });

  it("loadSavedStrategy drops a prediction for a player that's since sold instead of failing the whole load", async () => {
    const fx = await buildFixture();
    const actorId = fx.entry1.team.managerId!;
    await savePrediction(fx.entry1.id, fx.playerTwo.id, fx.entry2.id, 250, null, false, actorId);
    const { id } = await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

    await adminAssignPlayer(fx.auction.id, fx.playerTwo.id, fx.entry2.id, 100, fx.admin.id);

    await loadSavedStrategy(fx.entry1.id, id, actorId);

    const predictions = await prisma.auctionPlayerPrediction.findMany({ where: { teamAuctionEntryId: fx.entry1.id } });
    expect(predictions).toHaveLength(0);
  });

  it("deleteSavedStrategy clears the active pointer via SetNull when the deleted one was active", async () => {
    const fx = await buildFixture();
    const actorId = fx.entry1.team.managerId!;
    await setLiveStrategy(fx, actorId);
    const { id } = await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

    await deleteSavedStrategy(fx.entry1.id, id, actorId);

    const updatedEntry = await prisma.teamAuctionEntry.findUnique({ where: { id: fx.entry1.id } });
    expect(updatedEntry?.activeSavedStrategyId).toBeNull();
    const list = await listSavedStrategies(fx.entry1.id);
    expect(list).toHaveLength(0);
  });

  describe("getStrategyDirtyState", () => {
    it("is not dirty with no active strategy and empty live state", async () => {
      const fx = await buildFixture();
      const state = await getStrategyDirtyState(fx.entry1.id);
      expect(state).toEqual({ dirty: false, activeStrategyName: null });
    });

    it("is dirty with no active strategy but non-empty live state", async () => {
      const fx = await buildFixture();
      const actorId = fx.entry1.team.managerId!;
      await setLiveStrategy(fx, actorId);
      const state = await getStrategyDirtyState(fx.entry1.id);
      expect(state.dirty).toBe(true);
      expect(state.activeStrategyName).toBeNull();
    });

    it("is not dirty immediately after saving, and becomes dirty once live state drifts", async () => {
      const fx = await buildFixture();
      const actorId = fx.entry1.team.managerId!;
      await setLiveStrategy(fx, actorId);
      await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

      const clean = await getStrategyDirtyState(fx.entry1.id);
      expect(clean).toEqual({ dirty: false, activeStrategyName: "Plan A" });

      await upsertCategoryBudgetTarget(fx.entry1.id, fx.category.id, 999, actorId);

      const drifted = await getStrategyDirtyState(fx.entry1.id);
      expect(drifted).toEqual({ dirty: true, activeStrategyName: "Plan A" });
    });

    it("is not fooled by Decimal string-formatting differences (e.g. 150 vs 150.00)", async () => {
      const fx = await buildFixture();
      const actorId = fx.entry1.team.managerId!;
      await upsertCategoryBudgetTarget(fx.entry1.id, fx.category.id, 150, actorId);
      await saveCurrentAsStrategy(fx.entry1.id, "Plan A", actorId);

      // The saved snapshot stored "150" (from getStrategyForEntry's String()
      // cast); the live table stores a real Decimal that re-reads as
      // "150.00" via getStrategyForEntry's own String() cast too, through a
      // different code path -- this test only needs to confirm comparing
      // the two numerically (not as strings) treats them as equal.
      const state = await getStrategyDirtyState(fx.entry1.id);
      expect(state.dirty).toBe(false);
    });
  });
});

describe("rivalCategoryEstimate.service — replaceRivalCategoryEstimates", () => {
  it("wipes and replaces every estimate for the entry in one summary audit row", async () => {
    const { replaceRivalCategoryEstimates } = await import("@/lib/services/rivalCategoryEstimate.service");
    const fx = await buildFixture();
    const actorId = fx.entry1.team.managerId!;
    await upsertRivalCategoryEstimate(fx.entry1.id, fx.entry2.id, fx.category.id, 111, actorId);

    await replaceRivalCategoryEstimates(
      fx.entry1.id,
      [{ targetEntryId: fx.entry2.id, categoryId: fx.category.id, estimatedBudget: 222 }],
      actorId
    );

    const rows = await prisma.rivalCategoryBudgetEstimate.findMany({ where: { teamAuctionEntryId: fx.entry1.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].estimatedBudget.toString()).toBe("222");
  });

  it("rejects a target team that doesn't belong to this auction", async () => {
    const { replaceRivalCategoryEstimates } = await import("@/lib/services/rivalCategoryEstimate.service");
    const fx = await buildFixture();
    const actorId = fx.entry1.team.managerId!;
    await expect(
      replaceRivalCategoryEstimates(fx.entry1.id, [{ targetEntryId: "not-real", categoryId: fx.category.id, estimatedBudget: 100 }], actorId)
    ).rejects.toThrow("One or more teams do not belong to this auction");
  });
});
