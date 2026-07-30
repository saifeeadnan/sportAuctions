"use client";

import type { AuctionState } from "@/lib/services/auctionState.service";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { TeamBudgetBoard } from "@/components/auction/TeamBudgetBoard";
import { SoldTicker } from "@/components/auction/SoldTicker";
import { OnClockCard } from "@/components/auction/OnClockCard";
import { SaleAnnouncement } from "@/components/auction/SaleAnnouncement";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";
import { RosterRibbon } from "@/components/roster/RosterRibbon";
import { BidControl } from "@/components/auction/BidControl";
import { computeMaxBid } from "@/lib/auction/maxBid";

function CurrentBidLine({ player }: { player: { currentBid: string | null; currentBidderTeamName: string | null; basePrice: string } }) {
  return (
    <p className="text-sm">
      {player.currentBid ? (
        <>
          Current bid: <span className="font-semibold">{player.currentBid}</span> by{" "}
          {player.currentBidderTeamName}
        </>
      ) : (
        <>No bids yet — base price {player.basePrice}</>
      )}
    </p>
  );
}

export function LiveAuctionView({
  initialState,
  highlightTeamEntryId,
  canPlaceBids = false,
}: {
  initialState: AuctionState;
  highlightTeamEntryId?: string;
  /** True only when the current session user actually manages
   * `highlightTeamEntryId`'s team — a viewer's own-sold-player highlight
   * must only ever show the live bid, never get bidding controls. */
  canPlaceBids?: boolean;
}) {
  const { state, connected, lastSale } = useAuctionSocket(initialState.id, initialState);
  const onClock = state.players.find((p) => p.status === "IN_BIDDING");
  const myTeam = highlightTeamEntryId
    ? state.teams.find((t) => t.id === highlightTeamEntryId)
    : undefined;
  const myPlayers = highlightTeamEntryId
    ? state.players.filter((p) => p.soldToEntryId === highlightTeamEntryId)
    : [];

  // Same reserve-aware calculation the admin's auctioneer console shows for
  // every team — how much this team could bid on the on-clock player without
  // leaving itself unable to fill its remaining slots.
  const queue = state.players.filter(
    (p) => p.status === "AVAILABLE" || p.status === "IN_PRE_AUCTION_POOL" || p.status === "UNSOLD"
  );
  const remainingPoolBasePrices = onClock
    ? queue.filter((p) => p.id !== onClock.id).map((p) => Number(p.basePrice))
    : [];
  const myMaxBid =
    myTeam && onClock
      ? computeMaxBid(remainingPoolBasePrices, Number(myTeam.budgetRemaining), myTeam.slotsTotal - myTeam.slotsFilled)
      : null;

  return (
    <div className="flex flex-col gap-8">
      <SaleAnnouncement sale={lastSale} />
      <p className="text-xs text-black/50 dark:text-white/50">
        {connected ? "Live" : "Connecting…"} &middot; auction status: {state.status}
      </p>

      {myTeam ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="rounded border border-black/20 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {myTeam.hasSponsorImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/teams/${myTeam.teamId}/sponsor-image`}
                    alt={`${myTeam.teamName} sponsor`}
                    className="h-12 w-12 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
                  />
                )}
                <p className="font-medium">{myTeam.teamName} (your team)</p>
              </div>
              <p className="text-sm text-black/60 dark:text-white/60">
                Budget remaining: {myTeam.budgetRemaining} &middot; Slots: {myTeam.slotsFilled}/
                {myTeam.slotsTotal}
              </p>
              <TeamStrengthSummary players={myPlayers} />
            </section>

            <section>
              <h2 className="text-lg font-medium mb-3">On the clock</h2>
              <OnClockCard player={onClock} photoWidth={200} photoHeight={300} />
              {onClock && (
                <div className="flex flex-col gap-2 mt-3">
                  <CurrentBidLine player={onClock} />
                  {myMaxBid != null && (
                    <p className="text-sm text-black/60 dark:text-white/60">
                      Max possible bid:{" "}
                      <span className="font-medium text-black dark:text-white">
                        {myMaxBid < Number(onClock.basePrice) ? "Cannot bid" : myMaxBid}
                      </span>
                      *
                    </p>
                  )}
                  {canPlaceBids && (
                    <BidControl
                      auctionId={state.id}
                      player={onClock}
                      teamEntryId={myTeam.id}
                      slotsFilled={myTeam.slotsFilled}
                      slotsTotal={myTeam.slotsTotal}
                      maxBid={myMaxBid}
                    />
                  )}
                  {myMaxBid != null && (
                    <p className="text-xs text-black/50 dark:text-white/50">
                      * Just an indicator based on the players currently available in the pool —
                      it can change as the auction progresses.
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          <section>
            <h2 className="text-lg font-medium mb-3">Your roster</h2>
            <RosterRibbon
              grid
              players={myPlayers
                .filter((p) => p.status === "SOLD")
                .map((p) => ({
                  id: p.id,
                  playerName: p.name,
                  photoUrl: p.photoUrl,
                  position: p.position,
                  soldPrice: p.soldPrice,
                }))}
            />
          </section>
        </>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-medium mb-3">On the clock</h2>
            {!onClock ? (
              <p className="text-black/60 dark:text-white/60">
                No player is currently on the clock.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xl font-semibold">{onClock.name}</p>
                <p className="text-sm text-black/60 dark:text-white/60">
                  {onClock.categoryName} &middot; base price {onClock.basePrice}
                </p>
                <CurrentBidLine player={onClock} />
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">Teams</h2>
            <TeamBudgetBoard teams={state.teams} />
          </section>

          <section>
            <h2 className="text-lg font-medium mb-3">Sold / unsold</h2>
            <SoldTicker players={state.players} teams={state.teams} />
          </section>
        </>
      )}
    </div>
  );
}
