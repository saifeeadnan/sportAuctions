import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AuctionResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      tournament: true,
      entries: {
        include: {
          team: true,
          playersWon: { include: { player: true, category: true }, orderBy: { player: { name: "asc" } } },
        },
        orderBy: { team: { name: "asc" } },
      },
      auctionPlayers: { where: { status: "UNSOLD" }, include: { player: true } },
    },
  });
  if (!auction) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold mb-1">{auction.name} — results</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {auction.tournament.name} &middot; status: {auction.status}
          </p>
        </div>
        <a
          href={`/api/auctions/${auction.id}/export.csv`}
          className="rounded border border-black/20 dark:border-white/20 px-3 py-2 text-sm font-medium"
        >
          Export CSV
        </a>
      </div>

      {auction.entries.map((entry) => {
        const totalSpent = entry.playersWon.reduce((sum, p) => sum + Number(p.soldPrice ?? 0), 0);
        return (
          <section key={entry.id}>
            <h2 className="text-lg font-medium mb-1">{entry.team.name}</h2>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">
              Budget remaining: {String(entry.budgetRemaining)} &middot; Spent on{" "}
              {entry.playersWon.length} player(s): {totalSpent} &middot; Slots {entry.slotsFilled}/
              {entry.slotsTotal}
            </p>
            {entry.playersWon.length === 0 ? (
              <p className="text-sm text-black/60 dark:text-white/60">No players won.</p>
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
                  {entry.playersWon.map((ap) => (
                    <tr key={ap.id} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-2 pr-4">{ap.player.name}</td>
                      <td className="py-2 pr-4">{ap.category.name}</td>
                      <td className="py-2 pr-4">{String(ap.soldPrice)}</td>
                      <td className="py-2 pr-4">
                        {ap.soldVia === "PRE_AUCTION_DRAFT"
                          ? "Pre-auction draft"
                          : ap.soldVia === "ADMIN_ASSIGNED"
                            ? "Admin assigned"
                            : "Live bid"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <section>
        <h2 className="text-lg font-medium mb-1">Unsold players ({auction.auctionPlayers.length})</h2>
        {auction.auctionPlayers.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">None.</p>
        ) : (
          <ul className="text-sm text-black/60 dark:text-white/60">
            {auction.auctionPlayers.map((ap) => (
              <li key={ap.id}>{ap.player.name}</li>
            ))}
          </ul>
        )}
      </section>

      <Link href={`/admin/auctions/${auction.id}`} className="text-sm underline underline-offset-2">
        Back to auction
      </Link>
    </div>
  );
}
