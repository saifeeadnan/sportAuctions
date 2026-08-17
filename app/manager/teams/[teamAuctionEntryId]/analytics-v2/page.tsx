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
import { AnalyticsV2Dashboard } from "@/components/manager/AnalyticsV2Dashboard";

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

  const [snapshot, auction, strategy, auctionState] = await Promise.all([
    loadAuctionAnalyticsSnapshot(entry.auctionId, entry.id),
    prisma.auction.findUnique({
      where: { id: entry.auctionId },
      select: { name: true, tournament: { select: { name: true } } },
    }),
    getStrategyForEntry(entry.id),
    getAuctionState(entry.auctionId),
  ]);
  if (!snapshot || !auction || !auctionState) notFound();

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

  const rivalEstimateRows = computeRivalCategoryEstimates(
    snapshot.teams,
    snapshot.categories,
    snapshot.players,
    snapshot.sales,
    snapshot.rivalEstimates
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

  const allRosters = computeRivalRosters(snapshot.teams, snapshot.players, snapshot.sales, valueScores)
    .map((r) => ({
      teamId: r.teamId,
      teamName: teamNameById.get(r.teamId) ?? r.teamId,
      isSelf: r.teamId === selfTeam.id,
      budgetRemaining: r.budgetRemaining,
      teamStrength: r.teamStrength,
      players: r.entries.map((e) => ({
        playerId: e.playerId,
        playerName: playerNameById.get(e.playerId) ?? e.playerId,
        categoryName: categoryNameById.get(e.categoryId) ?? e.categoryId,
        price: e.price,
        valueScore: e.valueScore,
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

  const budgetTargetsByCategoryName: Record<string, number> = Object.fromEntries(
    strategy.budgetTargets
      .map((t) => [categoryNameById.get(t.categoryId), Number(t.targetAvgPrice)] as const)
      .filter((entry): entry is [string, number] => entry[0] != null)
  );

  const otherTeams = snapshot.teams.filter((t) => t.id !== selfTeam.id).map((t) => ({ id: t.id, name: t.name }));
  const initialEstimates = snapshot.rivalEstimates.map((e) => ({
    targetEntryId: e.targetTeamId,
    categoryId: e.categoryId,
    estimatedBudget: String(e.estimatedBudget),
  }));

  return (
    <AnalyticsV2Dashboard
      auctionId={entry.auctionId}
      initialState={auctionState}
      myTeamEntryId={entry.id}
      auctionName={auction.name}
      tournamentName={auction.tournament.name}
      wishlistItems={wishlistItems}
      wishlistSummary={wishlistSummary}
      strategy={{
        entryId: entry.id,
        categories: snapshot.categories.map((c) => ({ id: c.id, name: c.name })),
        players: strategyPlayers,
        initialMustHaveIds: strategy.mustHaveIds,
        initialAvoidIds: strategy.avoidIds,
        initialBudgetTargets: strategy.budgetTargets,
      }}
      budgetTargetsByCategoryName={budgetTargetsByCategoryName}
      rivalRosters={allRosters}
      rivalEstimateRows={rivalEstimateRows}
      estimateForm={{
        entryId: entry.id,
        teams: otherTeams,
        categories: snapshot.categories.map((c) => ({ id: c.id, name: c.name })),
        initialEstimates,
      }}
    />
  );
}
