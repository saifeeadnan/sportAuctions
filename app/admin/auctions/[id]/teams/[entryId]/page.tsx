import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

function formatSoldVia(soldVia: string | null) {
  if (soldVia === "PRE_AUCTION_DRAFT") return "Pre-auction draft";
  if (soldVia === "ADMIN_ASSIGNED") return "Admin assigned";
  if (soldVia === "LIVE_BID") return "Live bid";
  return "—";
}

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: entryId },
    include: { team: true, auction: { include: { tournament: true } } },
  });
  if (!entry || entry.auctionId !== id) notFound();

  const [confirmedPlayers, draftPicks] = await Promise.all([
    prisma.auctionPlayer.findMany({
      where: { soldToEntryId: entryId },
      include: { player: true, category: true },
      orderBy: { player: { name: "asc" } },
    }),
    prisma.preAuctionSubmission.findMany({
      where: { teamAuctionEntryId: entryId },
      include: { auctionPlayer: { include: { player: true, category: true } } },
      orderBy: { auctionPlayer: { player: { name: "asc" } } },
    }),
  ]);

  const showDraftPicks =
    entry.status === "PRE_AUCTION_DRAFTING" || entry.status === "PRE_AUCTION_SUBMITTED";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">{entry.team.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {entry.auction.tournament.name} &middot; {entry.auction.name} &middot; status:{" "}
          {entry.status}
        </p>
        <p className="text-sm text-black/60 dark:text-white/60">
          Budget remaining: {String(entry.budgetRemaining)} &middot; Slots: {entry.slotsFilled}/
          {entry.slotsTotal}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Confirmed roster ({confirmedPlayers.length})</h2>
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

      {showDraftPicks && (
        <section>
          <h2 className="text-lg font-medium mb-1">
            Pre-auction draft picks ({draftPicks.length})
          </h2>
          <p className="text-sm text-black/60 dark:text-white/60 mb-3">
            Not yet confirmed — these become final once pre-auction is locked and overlaps are
            resolved.
          </p>
          {draftPicks.length === 0 ? (
            <p className="text-sm text-black/60 dark:text-white/60">
              No draft picks submitted yet.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pr-4">Player</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Base price</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {draftPicks.map((pick) => (
                  <tr key={pick.id} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{pick.auctionPlayer.player.name}</td>
                    <td className="py-2 pr-4">{pick.auctionPlayer.category.name}</td>
                    <td className="py-2 pr-4">{String(pick.auctionPlayer.category.basePrice)}</td>
                    <td className="py-2 pr-4">
                      {pick.auctionPlayer.status === "AVAILABLE" ? "Pending" : pick.auctionPlayer.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <Link href={`/admin/auctions/${id}`} className="text-sm underline underline-offset-2">
        Back to auction
      </Link>
    </div>
  );
}
