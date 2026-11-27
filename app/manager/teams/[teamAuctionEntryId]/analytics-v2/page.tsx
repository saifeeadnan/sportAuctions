import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadAuctionAnalyticsSnapshot } from "@/lib/auction/analyticsAdapter";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { computePlayerValueScores } from "@/lib/auction-analytics/playerValue";
import { computeWishlistFeasibility } from "@/lib/auction-analytics/wishlistFeasibility";
import { computeRivalCategoryEstimates } from "@/lib/auction-analytics/rivalCategoryEstimate";
import { computeRivalRosters } from "@/lib/auction-analytics/rivalRosters";
import { getStrategyForEntry } from "@/lib/services/auctionStrategy.service";
import { getPredictionsForEntry } from "@/lib/services/auctionPrediction.service";
import { listSavedStrategies } from "@/lib/services/savedStrategy.service";
import { AnalyticsV2Dashboard } from "@/components/manager/AnalyticsV2Dashboard";
import type { PlayerPrediction } from "@/lib/auction/projectedStandings";

export default async function ManagerAnalyticsV2Page({
  params,
}: {
  params: Promise<{ teamAuctionEntryId: string }>;
}) {
  const { teamAuctionEntryId } = await params;
  const session = await auth();

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: { team: true },
  });
  if (!entry || entry.team.managerId !== session!.user.id || !entry.analyticsEnabled) {
    notFound();
  }

  const [snapshot, auction, strategy, auctionState, predictions, savedStrategies, activeSavedStrategy] =
    await Promise.all([
      loadAuctionAnalyticsSnapshot(entry.auctionId, entry.id),
      prisma.auction.findUnique({
        where: { id: entry.auctionId },
        select: { name: true, tournament: { select: { name: true } } },
      }),
      getStrategyForEntry(entry.id),
      getAuctionState(entry.auctionId),
      getPredictionsForEntry(entry.id),
      listSavedStrategies(entry.id),
      entry.activeSavedStrategyId
        ? prisma.savedAuctionStrategy.findUnique({
            where: { id: entry.activeSavedStrategyId },
            select: { name: true },
          })
        : null,
    ]);
  if (!snapshot || !auction || !auctionState) notFound();

  const initialPredictions: Record<string, PlayerPrediction> = Object.fromEntries(
    Object.entries(predictions).map(([auctionPlayerId, p]) => [
      auctionPlayerId,
      {
        teamId: p.predictedWinnerEntryId,
        amount: p.predictedAmount != null ? Number(p.predictedAmount) : null,
        minAmount: p.predictedMinAmount != null ? Number(p.predictedMinAmount) : null,
        unsold: p.predictedUnsold,
      },
    ])
  );

  const selfTeam = snapshot.teams.find((t) => t.id === snapshot.selfTeamId);
  if (!selfTeam) notFound();

  const teamNameById = new Map(snapshot.teams.map((t) => [t.id, t.name]));
  const categoryNameById = new Map(snapshot.categories.map((c) => [c.id, c.name]));
  const playerNameById = new Map(snapshot.players.map((p) => [p.id, p.name]));

  const valueScores = computePlayerValueScores(snapshot.players);

  const wishlistSummary = computeWishlistFeasibility(
    selfTeam,
    snapshot.players,
    snapshot.sales,
    snapshot.wishlist,
    valueScores
  );
  const wishlistItems = wishlistSummary.items.map((item) => ({
    ...item,
    playerName: playerNameById.get(item.playerId) ?? item.playerId,
  }));

  // The manager's own budget target lives in a different table
  // (AuctionCategoryBudgetTarget, via getStrategyForEntry — Live Analytics'
  // bid guidance and the Simulate engine's self-restraint gate both still
  // read it from there, untouched) than a rival estimate
  // (RivalCategoryBudgetEstimate). Reshaping it into the same
  // {targetTeamId, categoryId, estimatedBudget} input and merging it in
  // here is what lets computeRivalCategoryEstimates — already generic over
  // every team, never actually rival-specific — produce the exact same
  // Spent/Bought/Picks-left/Affordable row for the manager's own team that
  // it already produces for every rival, with no changes to that function.
  const selfEstimateInputs = strategy.budgetTargets.map((t) => ({
    targetTeamId: selfTeam.id,
    categoryId: t.categoryId,
    estimatedBudget: Number(t.targetAvgPrice),
  }));

  const rivalEstimateRows = computeRivalCategoryEstimates(
    snapshot.teams,
    snapshot.categories,
    snapshot.players,
    snapshot.sales,
    [...snapshot.rivalEstimates, ...selfEstimateInputs]
  ).map((row) => ({
    teamName: teamNameById.get(row.teamId) ?? row.teamId,
    categoryName: categoryNameById.get(row.categoryId) ?? row.categoryId,
    estimatedBudget: row.estimatedBudget,
    isInferred: row.isInferred,
    actualSpent: row.actualSpent,
    actualCount: row.actualCount,
    remainingEstimatedCount: row.remainingEstimatedCount,
    estimatedAffordablePrice: row.estimatedAffordablePrice,
  }));

  const totalSlotsByTeamId = new Map(snapshot.teams.map((t) => [t.id, t.totalSlots]));
  const allRosters = computeRivalRosters(snapshot.teams, snapshot.players, snapshot.sales, valueScores)
    .map((r) => ({
      teamId: r.teamId,
      teamName: teamNameById.get(r.teamId) ?? r.teamId,
      isSelf: r.teamId === selfTeam.id,
      budgetRemaining: r.budgetRemaining,
      teamStrength: r.teamStrength,
      slotsFilled: r.entries.length,
      slotsTotal: totalSlotsByTeamId.get(r.teamId) ?? r.entries.length,
      players: r.entries.map((e) => ({
        playerId: e.playerId,
        playerName: playerNameById.get(e.playerId) ?? e.playerId,
        categoryName: categoryNameById.get(e.categoryId) ?? e.categoryId,
        price: e.price,
        valueScore: e.valueScore,
        soldAt: e.soldAt,
        soldVia: e.soldVia,
      })),
    }))
    // The manager's own team always leads, everyone else keeps the adapter's
    // existing (alphabetical) order.
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

  const soldPlayerIds = new Set(snapshot.sales.map((s) => s.playerId));
  const strategyPlayers = snapshot.players
    .filter((p) => !soldPlayerIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position ?? null,
      categoryId: p.categoryId,
      categoryName: categoryNameById.get(p.categoryId) ?? p.categoryId,
      basePrice: String(p.basePrice),
    }));

  // A category with nobody left to act on (either nobody was ever in it, or
  // everybody in it has already sold) clutters Strategy's must-have/avoid
  // picker and budget-target grid, and My estimates' per-category inputs,
  // with a control that does nothing — hide it from both instead of
  // listing every auction-wide category unconditionally.
  const categoryIdsWithRemainingPlayers = new Set(strategyPlayers.map((p) => p.categoryId));
  const activeCategories = snapshot.categories
    .filter((c) => categoryIdsWithRemainingPlayers.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, basePrice: c.basePrice }));

  const budgetTargetsByCategoryName: Record<string, number> = Object.fromEntries(
    strategy.budgetTargets
      .map((t) => [categoryNameById.get(t.categoryId), Number(t.targetAvgPrice)] as const)
      .filter((entry): entry is [string, number] => entry[0] != null)
  );

  const otherTeams = snapshot.teams.filter((t) => t.id !== selfTeam.id).map((t) => ({ id: t.id, name: t.name }));
  // Self listed first, then every rival — the grid's own row for "you" vs.
  // "them" is distinguished purely by id === entryId at render time.
  const estimateFormTeams = [{ id: selfTeam.id, name: selfTeam.name }, ...otherTeams];
  const initialEstimates = [
    ...strategy.budgetTargets.map((t) => ({
      targetEntryId: selfTeam.id,
      categoryId: t.categoryId,
      estimatedBudget: t.targetAvgPrice,
    })),
    ...snapshot.rivalEstimates.map((e) => ({
      targetEntryId: e.targetTeamId,
      categoryId: e.categoryId,
      estimatedBudget: String(e.estimatedBudget),
    })),
  ];

  return (
    <AnalyticsV2Dashboard
      auctionId={entry.auctionId}
      initialState={auctionState}
      myTeamEntryId={entry.id}
      auctionName={auction.name}
      tournamentName={auction.tournament.name}
      wishlistItems={wishlistItems}
      wishlistSummary={wishlistSummary}
      initialPredictions={initialPredictions}
      strategy={{
        entryId: entry.id,
        initialMustHaveIds: strategy.mustHaveIds,
        initialAvoidIds: strategy.avoidIds,
        initialBudgetTargets: strategy.budgetTargets,
      }}
      budgetTargetsByCategoryName={budgetTargetsByCategoryName}
      rivalRosters={allRosters}
      rivalEstimateRows={rivalEstimateRows}
      estimateForm={{
        entryId: entry.id,
        teams: estimateFormTeams,
        categories: activeCategories,
        initialEstimates,
      }}
      activeStrategyName={activeSavedStrategy?.name ?? null}
      savedStrategies={savedStrategies}
    />
  );
}
