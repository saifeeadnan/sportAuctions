import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export default async function ViewerHomePage() {
  const auctions = await prisma.auction.findMany({
    where: { status: { in: ["BIDDING", "COMPLETED"] } },
    include: { tournament: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Watch an auction</h1>

      {auctions.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No auctions are live or completed yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {auctions.map((a) => (
            <li key={a.id}>
              <Link
                href={`/viewer/auctions/${a.id}/watch`}
                className={`${cardInteractive} flex items-center justify-between px-4 py-3`}
              >
                <span>
                  {a.name} &middot;{" "}
                  <span className="text-black/60 dark:text-white/60">
                    {a.tournament.name}
                  </span>
                </span>
                <Badge variant={a.status === "BIDDING" ? "info" : "success"}>{a.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
