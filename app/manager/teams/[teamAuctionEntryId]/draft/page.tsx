import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DraftForm } from "@/components/manager/DraftForm";
import { findManagerSelfAuctionPlayerId } from "@/lib/services/preAuctionDraft.service";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ teamAuctionEntryId: string }>;
}) {
  const { teamAuctionEntryId } = await params;
  const session = await auth();

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: {
      team: true,
      auction: true,
      draftSubmissions: true,
    },
  });

  if (!entry || entry.team.managerId !== session!.user.id) notFound();

  const [availablePlayers, lockedPlayerId] = await Promise.all([
    prisma.auctionPlayer.findMany({
      where: { auctionId: entry.auctionId, status: "AVAILABLE" },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
    entry.team.managerId
      ? findManagerSelfAuctionPlayerId(entry.auctionId, entry.team.managerId)
      : Promise.resolve(null),
  ]);

  const editable = entry.status === "PRE_AUCTION_DRAFTING" || entry.status === "PRE_AUCTION_SUBMITTED";
  const cap = entry.slotsTotal - entry.slotsFilled;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">
        {entry.team.name} &middot; {entry.auction.name}
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Status: {entry.status} &middot; pick up to {cap} player(s)
      </p>

      {!editable ? (
        <p className="text-black/60 dark:text-white/60">
          The draft window for this auction is closed.
        </p>
      ) : (
        <DraftForm
          entryId={entry.id}
          cap={cap}
          players={availablePlayers.map((ap) => ({
            id: ap.id,
            name: ap.player.name,
            position: ap.player.position,
            categoryName: ap.category.name,
            basePrice: String(ap.category.basePrice),
          }))}
          initialSelected={entry.draftSubmissions.map((s) => s.auctionPlayerId)}
          lockedPlayerId={lockedPlayerId ?? undefined}
        />
      )}
    </div>
  );
}
