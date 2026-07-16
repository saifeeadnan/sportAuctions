import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { lockPreAuctionAction } from "@/lib/actions/auction.actions";

export default async function LockReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      tournament: true,
      entries: { include: { team: true }, orderBy: { team: { name: "asc" } } },
    },
  });
  if (!auction) notFound();
  if (auction.status !== "PRE_AUCTION_OPEN") notFound();

  const submissions = await prisma.preAuctionSubmission.findMany({
    where: { teamAuctionEntry: { auctionId: id } },
    include: {
      teamAuctionEntry: { include: { team: true } },
      auctionPlayer: { include: { player: true, category: true } },
    },
    orderBy: [
      { teamAuctionEntry: { team: { name: "asc" } } },
      { auctionPlayer: { player: { name: "asc" } } },
    ],
  });

  const teamsByPlayer = new Map<string, string[]>();
  for (const s of submissions) {
    const list = teamsByPlayer.get(s.auctionPlayerId) ?? [];
    list.push(s.teamAuctionEntry.team.name);
    teamsByPlayer.set(s.auctionPlayerId, list);
  }

  const contestedCount = Array.from(teamsByPlayer.values()).filter((t) => t.length > 1).length;

  const submittedEntryIds = new Set(submissions.map((s) => s.teamAuctionEntryId));
  const notSubmitted = auction.entries.filter(
    (e) => e.status !== "PRE_AUCTION_SUBMITTED" && !submittedEntryIds.has(e.id)
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Review submitted drafts</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {auction.tournament.name} &middot; {auction.name} &middot; {submissions.length} pick(s)
          submitted &middot; {contestedCount} contested player(s)
        </p>
      </div>

      {notSubmitted.length > 0 && (
        <p className="text-sm rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2">
          Not yet submitted: {notSubmitted.map((e) => e.team.name).join(", ")}. Locking normally
          will fail until every team submits — use force lock to proceed anyway.
        </p>
      )}

      {submissions.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No draft picks have been submitted yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="py-2 pr-4">Team</th>
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Base price</th>
              <th className="py-2 pr-4">Overlap</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => {
              const teams = teamsByPlayer.get(s.auctionPlayerId) ?? [];
              const isOverlap = teams.length > 1;
              return (
                <tr
                  key={s.id}
                  className={`border-b border-black/5 dark:border-white/5 ${
                    isOverlap ? "bg-amber-500/15" : ""
                  }`}
                >
                  <td className="py-2 pr-4">{s.teamAuctionEntry.team.name}</td>
                  <td className="py-2 pr-4">{s.auctionPlayer.player.name}</td>
                  <td className="py-2 pr-4">{s.auctionPlayer.category.name}</td>
                  <td className="py-2 pr-4">{String(s.auctionPlayer.category.basePrice)}</td>
                  <td className="py-2 pr-4">
                    {isOverlap ? (
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        Contested by {teams.length} teams
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="text-sm text-black/60 dark:text-white/60">
        Contested players will be sent to the live auction pool instead of being auto-allocated.
        Uniquely-picked players will be confirmed to their team immediately at category base
        price.
      </p>

      <div className="flex gap-3">
        <form action={lockPreAuctionAction.bind(null, auction.id, false)}>
          <button
            type="submit"
            className="rounded bg-black text-white dark:bg-white dark:text-black px-3 py-2 text-sm font-medium"
          >
            Confirm &amp; lock pre-auction
          </button>
        </form>
        <form action={lockPreAuctionAction.bind(null, auction.id, true)}>
          <button
            type="submit"
            className="rounded border border-black/20 dark:border-white/20 px-3 py-2 text-sm font-medium"
          >
            Force lock (skip missing submissions)
          </button>
        </form>
        <Link
          href={`/admin/auctions/${auction.id}`}
          className="text-sm underline underline-offset-2 self-center"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
