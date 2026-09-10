import Link from "next/link";
import { auth } from "@/auth";
import { allLeagueIds } from "@/lib/auth/guards";
import { listSeedingRosters } from "@/lib/services/playerSeeding.service";
import { cardInteractive } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/dates";

/** Shared "which rosters can I rate?" list — mounted from both
 * /viewer/rate and /manager/rate (both link into the same
 * /viewer/rate/{rosterId} detail page), mirroring how the manager fantasy
 * index deep-links into the viewer's fantasy detail page. */
export async function RatePlayersIndex() {
  const session = await auth();
  const leagueIds = session?.user ? allLeagueIds(session) : null;

  const rosters = session?.user ? await listSeedingRosters(session.user.id, leagueIds) : [];

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Rate players</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        You&apos;re on the roster for these leagues — rate your teammates anonymously to help seed
        the auction. You&apos;ll see rosters here once you&apos;re on one and its rating window has
        been opened.
      </p>

      {rosters.length === 0 ? (
        <p className="text-black/60 dark:text-white/60">No rating windows are open for you right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rosters.map((r) => {
            const complete = r.ratableCount > 0 && r.ratedCount >= r.ratableCount;
            return (
              <li key={r.rosterId}>
                <Link
                  href={`/viewer/rate/${r.rosterId}`}
                  className={`${cardInteractive} flex items-center justify-between px-4 py-3`}
                >
                  <span>
                    {r.rosterName} &middot;{" "}
                    <span className="text-black/60 dark:text-white/60">{r.leagueName}</span>
                  </span>
                  {r.status === "scheduled" && (
                    <Badge variant="neutral">Opens {formatDateTime(r.opensAt)}</Badge>
                  )}
                  {r.status === "open" && (
                    <Badge variant={complete ? "success" : "warning"}>
                      Rated {r.ratedCount} of {r.ratableCount}
                    </Badge>
                  )}
                  {r.status === "closed" && <Badge variant="neutral">Closed</Badge>}
                  {r.status === "finalized" && <Badge variant="success">Published</Badge>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
