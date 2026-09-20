import type { AuctionStatePlayer, AuctionStateTeam } from "@/lib/services/auctionState.service";
import { shortName } from "@/lib/playerDisplayName";
import { computeGridLayout, GRID_GAP_PX } from "@/lib/broadcastGridLayout";
import { card } from "@/lib/ui";

function byMostRecentFirst(a: AuctionStatePlayer, b: AuctionStatePlayer): number {
  const aTime = a.soldAt ? new Date(a.soldAt).getTime() : 0;
  const bTime = b.soldAt ? new Date(b.soldAt).getTime() : 0;
  return bTime - aTime;
}

/**
 * Broadcast/OBS variant of SoldTicker — a wide per-team-column table (the
 * shape used on the console/manager pages, where a human can scroll) is
 * unusable here: nothing ever interacts with this canvas, so a scrollbar
 * just permanently hides whatever doesn't fit. Instead of a fixed guess at
 * column count, `computeGridLayout` (lib/broadcastGridLayout.ts) picks the
 * column count — and, if needed, a more compact card size — from the
 * actual measured space (`availableWidth`/`availableHeight`, the real box
 * left over after the header/message/footer/sponsor-ribbon around this
 * component) and the real content (team count, the roster with the most
 * players), so every team fits without scrolling in either direction.
 */
export function BroadcastSoldTicker({
  players,
  teams,
  availableWidth,
  availableHeight,
}: {
  players: AuctionStatePlayer[];
  teams: AuctionStateTeam[];
  availableWidth: number;
  availableHeight: number;
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

  const cards = [
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

  if (cards.every((c) => c.players.length === 0)) {
    return <p className="text-sm text-black/60 dark:text-white/60">No players resolved yet.</p>;
  }

  const maxPlayersPerCard = Math.max(...cards.map((c) => c.players.length));
  const { columns, tier } = computeGridLayout({
    teamCount: cards.length,
    maxPlayersPerCard,
    availableWidth,
    availableHeight,
  });
  const compact = tier.logoSize <= 64;
  const textSizeClass = compact ? "text-xs" : "text-sm";
  const cardPaddingClass = compact ? "p-2" : "p-3";

  return (
    <div
      className="grid w-full"
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: GRID_GAP_PX }}
    >
      {cards.map((c) => (
        <div key={c.name} className={`${card} ${cardPaddingClass} flex gap-3 min-w-0`}>
          {!c.isUnsold &&
            (c.hasSponsorImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/teams/${c.teamId}/sponsor-image`}
                alt=""
                style={{ height: tier.logoSize, width: tier.logoSize }}
                className="rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
              />
            ) : (
              <span
                style={{ height: tier.logoSize, width: tier.logoSize }}
                className="rounded bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 flex items-center justify-center text-3xl font-semibold text-black/30 dark:text-white/30 shrink-0"
              >
                {c.name.charAt(0).toUpperCase()}
              </span>
            ))}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className={`${textSizeClass} font-semibold truncate`}>
              {c.name}{" "}
              {!c.isUnsold && (
                <span className="text-black/50 dark:text-white/50 font-medium">
                  ({c.players.length}) Left : {c.budgetRemaining}
                </span>
              )}
            </p>
            {c.players.length === 0 ? (
              <p className="text-xs text-black/40 dark:text-white/40">—</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {c.players.map((p) => (
                  <li key={p.id} className={`${textSizeClass} truncate`}>
                    {c.isUnsold ? (
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
