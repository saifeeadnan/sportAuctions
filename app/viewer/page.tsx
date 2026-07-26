import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scopeLeagueId } from "@/lib/auth/guards";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { listEligibleCompletedAuctionsForViewer } from "@/lib/services/fantasyTeam.service";

export default async function ViewerHomePage() {
  const session = await auth();
  const leagueId = session?.user ? scopeLeagueId(session) : null;

  const [auctions, fantasyEligibleAuctions] = await Promise.all([
    prisma.auction.findMany({
      where: {
        status: { in: ["BIDDING", "COMPLETED"] },
        tournament: leagueId ? { leagueId } : undefined,
      },
      include: { tournament: true },
      orderBy: { createdAt: "desc" },
    }),
    session?.user
      ? listEligibleCompletedAuctionsForViewer(session.user.id, leagueId)
      : Promise.resolve([]),
  ]);

  const submittedFantasyTeams = session?.user
    ? await prisma.fantasyTeam.findMany({
        where: {
          userId: session.user.id,
          auctionId: { in: fantasyEligibleAuctions.map((a) => a.id) },
        },
        select: { auctionId: true },
      })
    : [];
  const submittedAuctionIds = new Set(submittedFantasyTeams.map((f) => f.auctionId));

  return (
    <div className="flex flex-col gap-8">
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

      {fantasyEligibleAuctions.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Your fantasy teams</h2>
          <p className="text-sm text-black/60 dark:text-white/60 mb-3">
            You&apos;re on the roster for these completed auctions — build a fantasy team using
            the real prices players sold for.
          </p>
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
                      <span className="text-black/60 dark:text-white/60">
                        {a.tournament.name}
                      </span>
                    </span>
                    <Badge variant={submitted ? "success" : "warning"}>
                      {submitted ? "Submitted" : "Build your team"}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
