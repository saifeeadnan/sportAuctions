import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scopeLeagueId } from "@/lib/auth/guards";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { listEligibleCompletedAuctionsForViewer } from "@/lib/services/fantasyTeam.service";
import { getRulesDocumentIfViewable } from "@/lib/services/tournamentDocument.service";

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

  // Checked once per distinct tournament (several auctions can share one) so a
  // "Rules" link only shows where this viewer is actually on the roster.
  const uniqueTournamentIds = Array.from(new Set(auctions.map((a) => a.tournament.id)));
  const rulesByTournamentId = new Map<string, boolean>();
  if (session?.user) {
    await Promise.all(
      uniqueTournamentIds.map(async (tournamentId) => {
        const doc = await getRulesDocumentIfViewable(tournamentId, session.user);
        rulesByTournamentId.set(tournamentId, !!doc);
      })
    );
  }

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
              <li
                key={a.id}
                className={`${cardInteractive} flex items-center justify-between px-4 py-3`}
              >
                <Link href={`/viewer/auctions/${a.id}/watch`} className="flex-1">
                  <span>
                    {a.name} &middot;{" "}
                    <span className="text-black/60 dark:text-white/60">
                      {a.tournament.name}
                    </span>
                  </span>
                </Link>
                <div className="flex items-center gap-3">
                  {rulesByTournamentId.get(a.tournament.id) && (
                    <a
                      href={`/tournaments/${a.tournament.id}/rules`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline underline-offset-2 text-black/60 dark:text-white/60"
                    >
                      Rules
                    </a>
                  )}
                  <Badge variant={a.status === "BIDDING" ? "info" : "success"}>{a.status}</Badge>
                </div>
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
