import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DraftForm } from "@/components/manager/DraftForm";
import { findManagerSelfAuctionPlayerId } from "@/lib/services/preAuctionDraft.service";

function formatSoldVia(soldVia: string | null) {
  if (soldVia === "PRE_AUCTION_DRAFT") return "Pre-auction draft";
  if (soldVia === "ADMIN_ASSIGNED") return "Admin assigned";
  if (soldVia === "LIVE_BID") return "Live bid";
  return "—";
}

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

  const [availablePlayers, lockedPlayerId, confirmedPlayers] = await Promise.all([
    prisma.auctionPlayer.findMany({
      where: { auctionId: entry.auctionId, status: "AVAILABLE" },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
    entry.team.managerId
      ? findManagerSelfAuctionPlayerId(entry.auctionId, entry.team.managerId)
      : Promise.resolve(null),
    prisma.auctionPlayer.findMany({
      where: { soldToEntryId: teamAuctionEntryId },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
  ]);

  const editable = entry.status === "PRE_AUCTION_DRAFTING" || entry.status === "PRE_AUCTION_SUBMITTED";
  const cap = entry.slotsTotal - entry.slotsFilled;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">
          {entry.team.name} &middot; {entry.auction.name}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Status: {entry.status} &middot; pick up to {cap} player(s)
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">
          Your confirmed roster so far ({confirmedPlayers.length})
        </h2>
        {confirmedPlayers.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">No players confirmed yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Player</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Price</th>
                <th className="py-2 pr-4">Via</th>
              </tr>
            </thead>
            <tbody>
              {confirmedPlayers.map((ap) => (
                <tr key={ap.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{ap.player.name}</td>
                  <td className="py-2 pr-4">{ap.category.name}</td>
                  <td className="py-2 pr-4">{ap.soldPrice != null ? String(ap.soldPrice) : "—"}</td>
                  <td className="py-2 pr-4">{formatSoldVia(ap.soldVia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Draft picks</h2>
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
      </section>
    </div>
  );
}
