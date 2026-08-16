import Link from "next/link";
import {
  FANTASY_SORT_LABELS,
  fantasySortHref,
  type FantasySortDir,
  type FantasySortKey,
  type FantasyStanding,
} from "@/lib/fantasyStandingsSort";
import { DeleteFantasyTeamButton } from "@/components/admin/DeleteFantasyTeamButton";
import { Badge } from "@/components/ui/Badge";
import { card } from "@/lib/ui";

/** A finalized team's roster, once picks can no longer change — just enough
 * to see who was picked and what it cost, no photos or position clutter. */
function RosterTable({
  picks,
  selfAuctionPlayerId,
}: {
  picks: FantasyStanding["team"]["picks"];
  selfAuctionPlayerId?: string;
}) {
  const hasPoints = picks.some((p) => p.auctionPlayer.points != null);
  const sortedPicks = [...picks].sort((a, b) => {
    const aPoints = a.auctionPlayer.points != null ? Number(a.auctionPlayer.points) : -Infinity;
    const bPoints = b.auctionPlayer.points != null ? Number(b.auctionPlayer.points) : -Infinity;
    return bPoints - aPoints;
  });

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left border-b border-black/10 dark:border-white/10">
          <th className="py-2 pr-4">Player</th>
          <th className="py-2 pr-4 text-right">Price</th>
          {hasPoints && <th className="py-2 pr-2 text-right">Points</th>}
        </tr>
      </thead>
      <tbody>
        {sortedPicks.map((p) => (
          <tr key={p.auctionPlayerId} className="border-b border-black/5 dark:border-white/5 last:border-0">
            <td className="py-2 pr-4">
              <span className="inline-flex items-center gap-2">
                {p.auctionPlayer.player.name}
                {p.auctionPlayerId === selfAuctionPlayerId && <Badge variant="info">You</Badge>}
              </span>
            </td>
            <td className="py-2 pr-4 text-right">{String(p.price)}</td>
            {hasPoints && (
              <td className="py-2 pr-2 text-right">
                {p.auctionPlayer.points != null ? String(p.auctionPlayer.points) : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Every fantasy team submitted for an auction, as a compact sortable list —
 * shared between the admin overview (with delete controls) and a viewer's/
 * manager's read-only standings view once the tournament has locked. Each
 * row expands to that team's drafted roster.
 */
export function FantasyStandingsList({
  auctionId,
  standings,
  hasPoints,
  sortKey,
  sortDir,
  highlightUserId,
  showDeleteButton = false,
}: {
  auctionId: string;
  standings: FantasyStanding[];
  hasPoints: boolean;
  sortKey: FantasySortKey;
  sortDir: FantasySortDir;
  /** Highlights this user's own row (e.g. a viewer looking at the full list). */
  highlightUserId?: string;
  showDeleteButton?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-black/50 dark:text-white/50">
          {hasPoints
            ? "Ranked by total points."
            : "Points haven't been uploaded yet — ranked by team strength in the meantime."}
        </p>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-black/50 dark:text-white/50">Sort:</span>
          {(Object.keys(FANTASY_SORT_LABELS) as FantasySortKey[]).map((key) => (
            <Link
              key={key}
              href={fantasySortHref(key, sortKey, sortDir)}
              className={
                key === sortKey
                  ? "font-semibold underline underline-offset-2"
                  : "text-black/60 dark:text-white/60 hover:underline underline-offset-2"
              }
            >
              {FANTASY_SORT_LABELS[key]}
              {key === sortKey && (sortDir === "asc" ? " ↑" : " ↓")}
            </Link>
          ))}
        </div>
      </div>

      <div className={card}>
        {standings.map(({ team, totalSpend, totalPoints, selfAuctionPlayerId, rank }, i) => {
          const isYou = team.userId === highlightUserId;
          return (
            <details
              key={team.id}
              className={i < standings.length - 1 ? "border-b border-black/[0.08] dark:border-white/10" : ""}
            >
              <summary
                className={`cursor-pointer select-none px-4 py-2 text-sm font-medium flex items-center justify-between gap-3 flex-wrap ${
                  isYou ? "bg-indigo-50 dark:bg-indigo-500/10" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  #{rank} &middot; {team.user.name}
                  {isYou && <Badge variant="info">You</Badge>}
                </span>
                <span className="text-black/60 dark:text-white/60 font-normal">
                  {hasPoints && (
                    <>
                      <span className="font-medium text-indigo-600 dark:text-indigo-400">
                        {totalPoints} pts
                      </span>{" "}
                      &middot;{" "}
                    </>
                  )}
                  spent {totalSpend}
                </span>
              </summary>
              <div className="px-4 pb-4 flex flex-col gap-3">
                {showDeleteButton && (
                  <div className="flex items-center justify-end gap-3">
                    <DeleteFantasyTeamButton
                      auctionId={auctionId}
                      fantasyTeamId={team.id}
                      viewerName={team.user.name}
                    />
                  </div>
                )}
                <RosterTable picks={team.picks} selfAuctionPlayerId={selfAuctionPlayerId} />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
