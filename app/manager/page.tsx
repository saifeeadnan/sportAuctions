import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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
      entries: { include: { auction: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">My teams</h1>

      {teams.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">
          You haven&apos;t been assigned to a team yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map((team) => (
            <li key={team.id} className={`${cardInteractive} px-4 py-3`}>
              <p className="font-medium">
                {team.name} &middot;{" "}
                <span className="text-black/60 dark:text-white/60">
                  {team.tournament.name}
                </span>
              </p>
              {team.entries.length === 0 ? (
                <p className="text-sm text-black/60 dark:text-white/60 mt-1">
                  No active draft yet.
                </p>
              ) : (
                <ul className="mt-1 text-sm flex flex-col gap-1.5">
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
