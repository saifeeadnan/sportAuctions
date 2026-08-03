import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { getStrategyForEntry } from "@/lib/services/auctionStrategy.service";
import { getPredictionsForEntry } from "@/lib/services/auctionPrediction.service";
import { AnalyticsDashboardPage } from "@/components/manager/AnalyticsDashboardPage";
import type { InitialStrategy } from "@/lib/auction/guidance";
import type { PlayerPrediction } from "@/lib/auction/projectedStandings";

export default async function ManagerAnalyticsPage({
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

  const state = await getAuctionState(entry.auctionId);
  if (!state) notFound();

  const [strategy, categories, predictions, auctionPlayers] = await Promise.all([
    getStrategyForEntry(entry.id),
    prisma.auctionCategory.findMany({
      where: { auctionId: entry.auctionId },
      select: { id: true, name: true },
    }),
    getPredictionsForEntry(entry.id),
    prisma.auctionPlayer.findMany({
      where: { auctionId: entry.auctionId, status: { not: "SOLD" } },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const initialStrategy: InitialStrategy = {
    mustHaveIds: strategy.mustHaveIds,
    avoidIds: strategy.avoidIds,
    budgetTargetsByCategoryName: Object.fromEntries(
      strategy.budgetTargets
        .map((t) => [categoryNameById.get(t.categoryId), Number(t.targetAvgPrice)] as const)
        .filter((entry): entry is [string, number] => entry[0] != null)
    ),
    budgetTargets: strategy.budgetTargets,
  };

  const initialPredictions: Record<string, PlayerPrediction> = Object.fromEntries(
    Object.entries(predictions).map(([auctionPlayerId, p]) => [
      auctionPlayerId,
      { teamId: p.predictedWinnerEntryId, amount: p.predictedAmount != null ? Number(p.predictedAmount) : null },
    ])
  );

  return (
    <AnalyticsDashboardPage
      initialState={state}
      myTeamId={entry.id}
      initialStrategy={initialStrategy}
      initialPredictions={initialPredictions}
      strategyCategories={categories}
      strategyPlayers={auctionPlayers.map((ap) => ({
        id: ap.id,
        name: ap.player.name,
        position: ap.player.position,
        categoryId: ap.categoryId,
        categoryName: ap.category.name,
        basePrice: String(ap.category.basePrice),
      }))}
    />
  );
}
