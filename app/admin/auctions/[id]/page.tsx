import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { openPreAuctionAction, startBiddingAction } from "@/lib/actions/auction.actions";
import { AssignPlayerForm } from "@/components/admin/AssignPlayerForm";

export default async function AuctionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      tournament: true,
      categories: true,
      entries: { include: { team: true }, orderBy: { team: { name: "asc" } } },
      auctionPlayers: { include: { player: true, category: true } },
    },
  });
  if (!auction) notFound();

  const statusCounts = auction.auctionPlayers.reduce<Record<string, number>>((acc, ap) => {
    acc[ap.status] = (acc[ap.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">{auction.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; status: {auction.status} &middot; team budget:{" "}
          {String(auction.teamBudget)}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Categories</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {auction.categories.map((c) => (
            <li key={c.id}>
              {c.name}: base price {String(c.basePrice)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Player pool ({auction.auctionPlayers.length})</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          {Object.entries(statusCounts)
            .map(([status, count]) => `${count} ${status}`)
            .join(" · ")}
        </p>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Teams</h2>
        {auction.entries.length === 0 ? (
          <p className="text-black/60 dark:text-white/60">
            Pre-auction has not been opened yet.
          </p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Team</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Budget remaining</th>
                <th className="py-2 pr-4">Slots</th>
              </tr>
            </thead>
            <tbody>
              {auction.entries.map((entry) => (
                <tr key={entry.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/auctions/${auction.id}/teams/${entry.id}`}
                      className="underline underline-offset-2"
                    >
                      {entry.team.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{entry.status}</td>
                  <td className="py-2 pr-4">{String(entry.budgetRemaining)}</td>
                  <td className="py-2 pr-4">
                    {entry.slotsFilled}/{entry.slotsTotal}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {auction.entries.length > 0 && auction.status !== "COMPLETED" && (
        <section>
          <h2 className="text-lg font-medium mb-1">Assign player directly</h2>
          <p className="text-sm text-black/60 dark:text-white/60 mb-3">
            Assigns a player straight to a team as sold, bypassing the pre-auction draft and
            live auction entirely.
          </p>
          <AssignPlayerForm
            auctionId={auction.id}
            players={auction.auctionPlayers
              .filter((ap) => ap.status === "AVAILABLE")
              .map((ap) => ({
                id: ap.id,
                name: ap.player.name,
                categoryName: ap.category.name,
                basePrice: String(ap.category.basePrice),
              }))}
            teams={auction.entries.map((entry) => ({
              id: entry.id,
              teamName: entry.team.name,
              budgetRemaining: String(entry.budgetRemaining),
              slotsFilled: entry.slotsFilled,
              slotsTotal: entry.slotsTotal,
            }))}
          />
        </section>
      )}

      <section className="flex gap-3">
        {auction.status === "CREATED" && (
          <form action={openPreAuctionAction.bind(null, auction.id)}>
            <button
              type="submit"
              className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
            >
              Open pre-auction
            </button>
          </form>
        )}

        {auction.status === "PRE_AUCTION_OPEN" && (
          <Link
            href={`/admin/auctions/${auction.id}/lock-review`}
            className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            Lock &amp; resolve overlaps
          </Link>
        )}

        {auction.status === "PRE_AUCTION_LOCKED" && (
          <form action={startBiddingAction.bind(null, auction.id)}>
            <button
              type="submit"
              className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
            >
              Start bidding
            </button>
          </form>
        )}

        {auction.status === "BIDDING" && (
          <Link
            href={`/auctioneer/auctions/${auction.id}/console`}
            className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            Go to auctioneer console
          </Link>
        )}

        {auction.status === "COMPLETED" && (
          <Link
            href={`/admin/auctions/${auction.id}/results`}
            className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            View results
          </Link>
        )}
      </section>
    </div>
  );
}
