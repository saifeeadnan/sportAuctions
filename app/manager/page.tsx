import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getRulesDocumentIfViewable } from "@/lib/services/tournamentDocument.service";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const ENTRY_STATUS_VARIANT: Record<string, "neutral" | "info" | "success" | "warning"> = {
  AUCTION_LIVE: "info",
  FINAL: "success",
  ALLOCATED_PRE_AUCTION: "warning",
  PRE_AUCTION_SUBMITTED: "warning",
};

export default async function ManagerHomePage() {
  const session = await auth();
  const teams = await prisma.team.findMany({
    where: { managerId: session!.user.id },
    include: {
      tournament: true,
      entries: { include: { auction: true }, orderBy: { auction: { createdAt: "desc" } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Checked once per distinct tournament (a manager could have teams across
  // several) so the rules link shows up as soon as they're assigned a team —
  // no auction needs to exist yet.
  const uniqueTournamentIds = Array.from(new Set(teams.map((t) => t.tournamentId)));
  const rulesByTournamentId = new Map<string, boolean>();
  await Promise.all(
    uniqueTournamentIds.map(async (tournamentId) => {
      const doc = await getRulesDocumentIfViewable(tournamentId, session!.user);
      rulesByTournamentId.set(tournamentId, !!doc);
    })
  );

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Tournaments</h1>

      {teams.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          You haven&apos;t been assigned to a team yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {teams.map((team) => {
            // Most recently created auction this team has an entry for —
            // the one worth badging on the tournaments list.
            const latestEntry = team.entries[0];
            return (
              <li
                key={team.id}
                className={`${cardInteractive} flex items-center justify-between gap-4 px-4 py-3`}
              >
                <Link
                  href={`/manager/team/${team.id}`}
                  className="flex-1 flex items-center justify-between gap-3"
                >
                  <span>
                    {team.tournament.name}{" "}
                    <span className="text-black/50 dark:text-white/50">&middot;</span>{" "}
                    <span className="font-medium underline underline-offset-2">{team.name}</span>
                  </span>
                  {latestEntry && (
                    <span className="mr-4">
                      <Badge variant={ENTRY_STATUS_VARIANT[latestEntry.status] ?? "neutral"}>
                        {latestEntry.status}
                      </Badge>
                    </span>
                  )}
                </Link>
                {rulesByTournamentId.get(team.tournamentId) && (
                  <a
                    href={`/tournaments/${team.tournamentId}/rules`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline underline-offset-2 text-black/60 dark:text-white/60"
                  >
                    Rules
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
