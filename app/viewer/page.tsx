import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scopeLeagueId } from "@/lib/auth/guards";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { getRulesDocumentIfViewable } from "@/lib/services/tournamentDocument.service";

export default async function ViewerHomePage() {
  const session = await auth();
  const leagueId = session?.user ? scopeLeagueId(session) : null;

  const auctions = await prisma.auction.findMany({
    where: {
      status: { in: ["BIDDING", "COMPLETED"] },
      tournament: leagueId ? { leagueId } : undefined,
    },
    include: { tournament: true },
    orderBy: { createdAt: "desc" },
  });

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

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Watch auctions</h1>

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
  );
}
