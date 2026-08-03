import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scopeLeagueId } from "@/lib/auth/guards";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { listEligibleCompletedAuctionsForViewer } from "@/lib/services/fantasyTeam.service";

export default async function ManagerFantasyPage() {
  const session = await auth();
  const leagueId = scopeLeagueId(session!);

  const fantasyEligibleAuctions = await listEligibleCompletedAuctionsForViewer(
    session!.user.id,
    leagueId
  );

  const submittedFantasyTeams = await prisma.fantasyTeam.findMany({
    where: {
      userId: session!.user.id,
      auctionId: { in: fantasyEligibleAuctions.map((a) => a.id) },
    },
    select: { auctionId: true },
  });
  const submittedAuctionIds = new Set(submittedFantasyTeams.map((f) => f.auctionId));

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Fantasy teams</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        You&apos;re on the roster for these completed auctions — build a fantasy team using the
        real prices players sold for.
      </p>

      {fantasyEligibleAuctions.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          No completed auctions you&apos;re eligible for yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fantasyEligibleAuctions.map((a) => {
            const submitted = submittedAuctionIds.has(a.id);
            return (
              <li key={a.id}>
                <Link
                  href={`/viewer/auctions/${a.id}/fantasy`}
                  className={`${cardInteractive} flex items-center justify-between px-4 py-3`}
                >
                  <span>
                    {a.name} &middot;{" "}
                    <span className="text-black/60 dark:text-white/60">{a.tournament.name}</span>
                  </span>
                  <Badge variant={submitted ? "success" : "warning"}>
                    {submitted ? "Submitted" : "Build your team"}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
