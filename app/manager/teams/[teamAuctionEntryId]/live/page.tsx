import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuctionState } from "@/lib/services/auctionState.service";
import { listTournamentSponsors } from "@/lib/services/tournamentSponsor.service";
import { getStrategyForEntry } from "@/lib/services/auctionStrategy.service";
import { LiveAuctionView } from "@/components/auction/LiveAuctionView";
import type { InitialStrategy } from "@/lib/auction/guidance";
import { SponsorRibbon } from "@/components/tournament/SponsorRibbon";

export default async function ManagerLivePage({
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
  if (!entry || entry.team.managerId !== session!.user.id) notFound();

  const state = await getAuctionState(entry.auctionId);
  if (!state) notFound();

  const sponsors = await listTournamentSponsors(entry.team.tournamentId);

  // Only fetched (and only ever sent to the client) when the flag is on —
  // this page only needs enough of the strategy to drive the "Analytics"
  // trigger button's status dot; the full dashboard (and its categories/
  // players/predictions data) lives in the separate /analytics popup page.
  let initialStrategy: InitialStrategy | undefined;
  if (entry.analyticsEnabled) {
    const [strategy, categories] = await Promise.all([
      getStrategyForEntry(entry.id),
      prisma.auctionCategory.findMany({
        where: { auctionId: entry.auctionId },
        select: { id: true, name: true },
      }),
    ]);
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
    initialStrategy = {
      mustHaveIds: strategy.mustHaveIds,
      avoidIds: strategy.avoidIds,
      budgetTargetsByCategoryName: Object.fromEntries(
        strategy.budgetTargets
          .map((t) => [categoryNameById.get(t.categoryId), Number(t.targetAvgPrice)] as const)
          .filter((entry): entry is [string, number] => entry[0] != null)
      ),
      budgetTargets: strategy.budgetTargets,
    };
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{state.name}</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">{state.tournamentName}</p>
      <LiveAuctionView
        initialState={state}
        highlightTeamEntryId={entry.id}
        canPlaceBids
        analyticsEnabled={entry.analyticsEnabled}
        initialStrategy={initialStrategy}
      />
      <SponsorRibbon sponsors={sponsors} />
    </div>
  );
}
