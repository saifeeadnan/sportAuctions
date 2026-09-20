import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { allLeagueIds } from "@/lib/auth/guards";
import { loadScopedAuction } from "@/lib/auth/scope";
import { ConfirmedRosterTable } from "@/components/roster/ConfirmedRosterTable";
import { Badge } from "@/components/ui/Badge";

/** Read-only preview of an auction's player pool before it's opened for
 * bidding — the sibling "watch" page only makes sense once bidding is
 * actually live, so a viewer has nowhere to see who's up for auction ahead
 * of time without this. */
export default async function UpcomingAuctionPlayersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const auction = await loadScopedAuction(id, allLeagueIds(session!));
  if (auction.status !== "CREATED") notFound();

  const auctionPlayers = await prisma.auctionPlayer.findMany({
    where: { auctionId: id },
    include: { player: true, category: true },
    orderBy: { player: { name: "asc" } },
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-semibold">{auction.name}</h1>
        <Badge variant="neutral">Not yet opened</Badge>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        {auction.tournament.name} &middot; Preview of the player pool — bidding hasn&apos;t started,
        so nothing here is final yet.
      </p>
      <ConfirmedRosterTable
        players={auctionPlayers.map((ap) => ({
          id: ap.id,
          playerName: ap.player.name,
          photoUrl: ap.player.photoUrl,
          categoryName: ap.category.name,
          soldPrice: null,
          soldVia: null,
        }))}
      />
    </div>
  );
}
