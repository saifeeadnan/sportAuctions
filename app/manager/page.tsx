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
      sponsorImage: { select: { id: true } },
      entries: { include: { auction: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Checked once per distinct tournament (a manager could have teams across
  // several) so the rules link shows up as soon as they're assigned a team —
  // no auction needs to exist yet.
  const uniqueTournamentIds = Array.from(new Set(teams.map((t) => t.tournamentId)));
  const rulesByTournamentId = new Map<string, { fileName: string } | null>();
  await Promise.all(
    uniqueTournamentIds.map(async (tournamentId) => {
      const doc = await getRulesDocumentIfViewable(tournamentId, session!.user);
      rulesByTournamentId.set(tournamentId, doc);
    })
  );

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">My teams</h1>

      {teams.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          You haven&apos;t been assigned to a team yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {teams.map((team) => (
            <li key={team.id} className={`${cardInteractive} flex flex-col items-center gap-2 p-4`}>
              {team.sponsorImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/teams/${team.id}/sponsor-image`}
                  alt={`${team.name} sponsor`}
                  className="h-[200px] w-[200px] rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-2"
                />
              ) : (
                <div className="h-[200px] w-[200px] rounded border border-dashed border-black/10 dark:border-white/10 flex items-center justify-center text-xs text-black/30 dark:text-white/30">
                  No logo
                </div>
              )}
              <p className="font-medium text-center">
                {team.name} &middot;{" "}
                <span className="text-black/60 dark:text-white/60">
                  {team.tournament.name}
                </span>
              </p>
              {rulesByTournamentId.get(team.tournamentId) && (
                <a
                  href={`/tournaments/${team.tournamentId}/rules`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline underline-offset-2"
                >
                  View tournament rules
                </a>
              )}
              {team.entries.length === 0 ? (
                <p className="text-sm text-black/60 dark:text-white/60">No active draft yet.</p>
              ) : (
                <ul className="text-sm flex flex-col items-center gap-1.5">
                  {team.entries.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2">
                      <span className="text-black/60 dark:text-white/60">{entry.auction.name}</span>
                      <Badge variant={ENTRY_STATUS_VARIANT[entry.status] ?? "neutral"}>
                        {entry.status}
                      </Badge>
                      {(entry.status === "PRE_AUCTION_DRAFTING" ||
                        entry.status === "PRE_AUCTION_SUBMITTED") && (
                        <Link
                          href={`/manager/teams/${entry.id}/draft`}
                          className="underline underline-offset-2"
                        >
                          Submit draft
                        </Link>
                      )}
                      {entry.status === "ALLOCATED_PRE_AUCTION" && (
                        <Link
                          href={`/manager/teams/${entry.id}/draft`}
                          className="underline underline-offset-2"
                        >
                          View team
                        </Link>
                      )}
                      {(entry.status === "AUCTION_LIVE" || entry.status === "FINAL") && (
                        <Link
                          href={`/manager/teams/${entry.id}/live`}
                          className="underline underline-offset-2"
                        >
                          View live
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
