import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession, AuthError } from "@/lib/auth/guards";
import { DomainError } from "@/lib/errors";
import { loadTeamRosterGrid } from "@/lib/services/teamRosterGrid.service";
import { AllTeamRostersTable } from "@/components/roster/AllTeamRostersTable";
import { buttonSecondary } from "@/lib/ui";

/** Every team's final roster for a concluded auction — the one place a
 * manager can see how the other teams turned out. */
export default async function AllTeamRostersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();

  let grid;
  try {
    grid = await loadTeamRosterGrid(session, id);
  } catch (error) {
    // Not yours, not concluded yet, or no such auction — all the same to the
    // visitor, and none worth an error page.
    if (error instanceof AuthError || error instanceof DomainError) notFound();
    throw error;
  }

  const base = `/api/auctions/${id}/team-rosters`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold mb-1">
          <span className="text-black/50 dark:text-white/50 font-normal">
            {grid.leagueName} / {grid.tournamentName} /{" "}
          </span>
          {grid.auctionName}
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Final rosters for all {grid.teams.length} teams
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <a href={`${base}/export.xlsx`} className={`${buttonSecondary} px-3 py-1.5 text-xs`}>
          Download Excel
        </a>
        <a href={`${base}/export.csv`} className={`${buttonSecondary} px-3 py-1.5 text-xs`}>
          Download CSV
        </a>
      </div>

      <AllTeamRostersTable grid={grid} />

      <Link href="/manager" className="text-sm underline underline-offset-2">
        &larr; Back to tournaments
      </Link>
    </div>
  );
}
