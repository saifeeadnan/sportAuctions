import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { openPreAuctionAction, startBiddingAction } from "@/lib/actions/auction.actions";
import { AssignPlayerForm } from "@/components/admin/AssignPlayerForm";
import { card, cardInteractive, buttonPrimary, buttonSecondary } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const ENTRY_STATUS_VARIANT: Record<string, "neutral" | "info" | "success" | "warning"> = {
  AUCTION_LIVE: "info",
  FINAL: "success",
  ALLOCATED_PRE_AUCTION: "warning",
};

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

  const playerCountByCategory = auction.auctionPlayers.reduce<Record<string, number>>(
    (acc, ap) => {
      acc[ap.categoryId] = (acc[ap.categoryId] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">{auction.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; status: {auction.status} &middot; team budget:{" "}
          {String(auction.teamBudget)}
        </p>
        <p className="text-sm text-black/60 dark:text-white/60">
          Player pool ({auction.auctionPlayers.length}):{" "}
          {Object.entries(statusCounts)
            .map(([status, count]) => `${count} ${status}`)
            .join(" · ")}
        </p>
      </div>

      <details className={card}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
          Categories &amp; base prices ({auction.categories.length})
        </summary>
        <div className="px-4 pb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-black/10 dark:border-white/10">
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Base price</th>
                <th className="py-2 pr-4">Players</th>
                <th className="py-2 pr-4">Pre-auction draft</th>
              </tr>
            </thead>
            <tbody>
              {auction.categories.map((c) => (
                <tr key={c.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4">{c.name}</td>
                  <td className="py-2 pr-4">{String(c.basePrice)}</td>
                  <td className="py-2 pr-4">{playerCountByCategory[c.id] ?? 0}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={c.preAuctionEligible ? "success" : "neutral"}>
                      {c.preAuctionEligible ? "Allowed" : "Live bidding only"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section>
        <h2 className="text-lg font-medium mb-3">Teams</h2>
        {auction.entries.length === 0 ? (
          <p className="text-black/60 dark:text-white/60">
            Pre-auction has not been opened yet.
          </p>
        ) : (
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-black/10 dark:border-white/10">
                  <th className="py-2 pl-4 pr-4">Team</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Budget remaining</th>
                  <th className="py-2 pr-4">Slots</th>
                </tr>
              </thead>
              <tbody>
                {auction.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-2 pl-4 pr-4">
                      <Link
                        href={`/admin/auctions/${auction.id}/teams/${entry.id}`}
                        className="underline underline-offset-2"
                      >
                        {entry.team.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={ENTRY_STATUS_VARIANT[entry.status] ?? "neutral"}>
                        {entry.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4">{String(entry.budgetRemaining)}</td>
                    <td className="py-2 pr-4">
                      {entry.slotsFilled}/{entry.slotsTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {auction.entries.length > 0 && auction.status !== "COMPLETED" && (
        <details className={card}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
            Assign player directly
          </summary>
          <div className="px-4 pb-4">
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
          </div>
        </details>
      )}

      <section className="flex gap-3">
        {auction.status === "CREATED" && (
          <form action={openPreAuctionAction.bind(null, auction.id)}>
            <button type="submit" className={buttonPrimary}>
              Open pre-auction
            </button>
          </form>
        )}

        {auction.status === "PRE_AUCTION_OPEN" && (
          <Link href={`/admin/auctions/${auction.id}/lock-review`} className={buttonPrimary}>
            Lock &amp; resolve overlaps
          </Link>
        )}

        {auction.status === "PRE_AUCTION_LOCKED" && (
          <form action={startBiddingAction.bind(null, auction.id)}>
            <button type="submit" className={buttonPrimary}>
              Start bidding
            </button>
          </form>
        )}

        {auction.status === "BIDDING" && (
          <Link href={`/auctioneer/auctions/${auction.id}/console`} className={buttonPrimary}>
            Go to auctioneer console
          </Link>
        )}

        {auction.status === "COMPLETED" && (
          <Link href={`/admin/auctions/${auction.id}/results`} className={buttonSecondary}>
            View results
          </Link>
        )}
      </section>
    </div>
  );
}
