import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminOrLeagueAdmin, assertInScope } from "@/lib/auth/guards";
import { isLeagueReadOnly } from "@/lib/services/league.service";
import { CorrectSoldPriceRow } from "@/components/admin/CorrectSoldPriceRow";
import { CorrectCategoryBasePriceForm } from "@/components/admin/CorrectCategoryBasePriceForm";
import { CorrectTeamBudgetForm } from "@/components/admin/CorrectTeamBudgetForm";
import { card } from "@/lib/ui";

export default async function CorrectResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { leagueIds } = await requireAdminOrLeagueAdmin();

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      tournament: true,
      categories: true,
      auctionPlayers: {
        where: { status: "SOLD" },
        include: { player: true, soldToEntry: { include: { team: true } } },
        orderBy: { player: { name: "asc" } },
      },
    },
  });
  if (!auction) notFound();
  assertInScope(leagueIds, auction.tournament.leagueId);
  // Corrections only make sense once the auction has actually concluded —
  // the service layer rejects otherwise too, this just avoids showing the
  // page at all for a stage where every action in it would just error.
  if (auction.status !== "COMPLETED") notFound();

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: auction.tournament.leagueId },
    select: { endDate: true },
  });
  const readOnly = isLeagueReadOnly(league);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">{auction.name} — correct results</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; fixes here cascade into team budgets and any fantasy
          team that picked the affected player.
        </p>
      </div>

      {readOnly ? (
        <p className="text-sm text-black/40 dark:text-white/40">
          This league is read-only — corrections can&apos;t be made.
        </p>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-medium mb-2">Sold prices</h2>
            {auction.auctionPlayers.length === 0 ? (
              <p className="text-sm text-black/60 dark:text-white/60">No players were sold.</p>
            ) : (
              <div className={`${card} divide-y divide-black/[0.08] dark:divide-white/10`}>
                {auction.auctionPlayers.map((ap) => (
                  <div key={ap.id} className="p-4">
                    <CorrectSoldPriceRow
                      auctionId={auction.id}
                      auctionPlayerId={ap.id}
                      playerName={ap.player.name}
                      teamName={ap.soldToEntry?.team.name ?? "—"}
                      currentPrice={String(ap.soldPrice)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">Category base prices</h2>
            <div className={`${card} divide-y divide-black/[0.08] dark:divide-white/10`}>
              {auction.categories.map((cat) => (
                <div key={cat.id} className="p-4 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <CorrectCategoryBasePriceForm
                    auctionId={auction.id}
                    categoryId={cat.id}
                    currentBasePrice={String(cat.basePrice)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium mb-2">Team budget</h2>
            <CorrectTeamBudgetForm auctionId={auction.id} teamBudget={String(auction.teamBudget)} />
          </section>
        </>
      )}

      <Link href={`/admin/auctions/${auction.id}`} className="text-sm underline underline-offset-2">
        Back to auction
      </Link>
    </div>
  );
}
