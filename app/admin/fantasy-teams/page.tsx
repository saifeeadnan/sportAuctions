import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export default async function AdminFantasyTeamsIndexPage() {
  const auctions = await prisma.auction.findMany({
    where: { status: "COMPLETED" },
    include: {
      tournament: true,
      _count: { select: { fantasyTeams: true } },
    },
    orderBy: { completedAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Fantasy teams</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Completed auctions — pick one to view or manage its submitted fantasy teams.
      </p>

      {auctions.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No completed auctions yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {auctions.map((a) => (
            <li key={a.id}>
              <Link
                href={`/admin/auctions/${a.id}/fantasy-teams`}
                className={`${cardInteractive} flex items-center justify-between gap-4 px-4 py-3`}
              >
                <span>
                  {a.name}{" "}
                  <span className="text-black/50 dark:text-white/50">
                    ({a.tournament.name})
                  </span>
                </span>
                <Badge variant={a._count.fantasyTeams > 0 ? "success" : "neutral"}>
                  {a._count.fantasyTeams} submitted
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
