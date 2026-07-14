import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AuctioneerHomePage() {
  const auctions = await prisma.auction.findMany({
    where: { status: { in: ["PRE_AUCTION_LOCKED", "BIDDING"] } },
    include: { tournament: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Auctions to run</h1>

      {auctions.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No auctions are ready for bidding right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {auctions.map((a) => (
            <li key={a.id}>
              <Link
                href={`/auctioneer/auctions/${a.id}/console`}
                className="flex items-center justify-between rounded border border-black/10 dark:border-white/10 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span>
                  {a.name} &middot;{" "}
                  <span className="text-black/60 dark:text-white/60">
                    {a.tournament.name}
                  </span>
                </span>
                <span className="text-sm text-black/60 dark:text-white/60">{a.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
