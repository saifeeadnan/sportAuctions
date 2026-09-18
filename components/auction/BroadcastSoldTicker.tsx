import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";
import { shortName } from "@/lib/playerDisplayName";
import { card } from "@/lib/ui";

function byMostRecentFirst(a: AuctionStatePlayer, b: AuctionStatePlayer): number {
  const aTime = a.soldAt ? new Date(a.soldAt).getTime() : 0;
  const bTime = b.soldAt ? new Date(b.soldAt).getTime() : 0;
  return bTime - aTime;
}

/**
 * Broadcast/OBS variant of SoldTicker — a wide per-team-column table (the
 * shape used on the console/manager pages, where a human can scroll) is
 * unusable here: nothing ever interacts with this canvas, so a horizontal
 * scrollbar just permanently hides every team past however many columns fit
 * the window. A wrapping grid of per-team cards instead uses the vertical
 * space this view already has spare (its parent container is
 * `overflow-y-auto`) — every team is always fully visible, however many
 * there are.
 */
export function BroadcastSoldTicker({
  players,
  teams,
}: {
  players: AuctionStatePlayer[];
  teams: AuctionStateTeam[];
}) {
  const soldByTeam = new Map<string, AuctionStatePlayer[]>();
  for (const team of teams) soldByTeam.set(team.teamName, []);
  for (const p of players) {
    if (p.status === "SOLD" && p.soldToTeamName) {
      soldByTeam.get(p.soldToTeamName)?.push(p);
    }
  }
  for (const list of soldByTeam.values()) {
    list.sort(byMostRecentFirst);
  }

  const unsold = players
    .filter((p) => p.status === "UNSOLD")
    .sort((a, b) => a.name.localeCompare(b.name));

  const columns = [
    ...[...teams]
      .sort((a, b) => Number(b.budgetRemaining) - Number(a.budgetRemaining))
      .map((t) => ({
        name: t.teamName,
        teamId: t.teamId,
        hasSponsorImage: t.hasSponsorImage,
        budgetRemaining: t.budgetRemaining,
        players: soldByTeam.get(t.teamName) ?? [],
        isUnsold: false,
      })),
    ...(unsold.length > 0
      ? [
          {
            name: "Unsold",
            teamId: null,
            hasSponsorImage: false,
            budgetRemaining: null,
            players: unsold,
            isUnsold: true,
          },
        ]
      : []),
  ];

  if (columns.every((c) => c.players.length === 0)) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players resolved yet.</p>;
  }

  return (
    <div
      className="grid gap-3 w-full"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))" }}
    >
      {columns.map((col) => (
        <div key={col.name} className={`${card} p-3 flex gap-3 min-w-0`}>
          {!col.isUnsold &&
            (col.hasSponsorImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/teams/${col.teamId}/sponsor-image`}
                alt=""
                className="h-32 w-32 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
              />
            ) : (
              <span className="h-32 w-32 rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center text-3xl font-semibold text-black/30 dark:text-white/30 shrink-0">
                {col.name.charAt(0).toUpperCase()}
              </span>
            ))}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {col.name}{" "}
              {!col.isUnsold && col.players.length > 0 && (
                <span className="text-black/50 dark:text-white/50 font-medium">
                  ({col.players.length})
                </span>
              )}
            </p>
            {!col.isUnsold && (
              <p className="text-xs text-black/50 dark:text-white/50">
                Budget: {col.budgetRemaining}
              </p>
            )}
            {col.players.length === 0 ? (
              <p className="text-xs text-black/40 dark:text-white/40">—</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {col.players.map((p) => (
                  <li key={p.id} className="text-sm truncate">
                    {col.isUnsold ? (
                      <span className="text-black/60 dark:text-white/60">{shortName(p.name)}</span>
                    ) : (
                      <>
                        {shortName(p.name)}
                        {p.isCaptain && " (C)"}{" "}
                        <span className="text-black/50 dark:text-white/50">({p.soldPrice})</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
