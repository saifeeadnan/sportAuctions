"use client";

import type { AuctionState } from "@/lib/services/auctionState.service";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { TeamBudgetBoard } from "@/components/auction/TeamBudgetBoard";
import { SoldTicker } from "@/components/auction/SoldTicker";
import { OnClockCard } from "@/components/auction/OnClockCard";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";
import { ConfirmedRosterTable } from "@/components/roster/ConfirmedRosterTable";

export function LiveAuctionView({
  initialState,
  highlightTeamEntryId,
}: {
  initialState: AuctionState;
  highlightTeamEntryId?: string;
}) {
  const { state, connected } = useAuctionSocket(initialState.id, initialState);
  const onClock = state.players.find((p) => p.status === "IN_BIDDING");
  const myTeam = highlightTeamEntryId
    ? state.teams.find((t) => t.id === highlightTeamEntryId)
    : undefined;
  const myPlayers = highlightTeamEntryId
    ? state.players.filter((p) => p.soldToEntryId === highlightTeamEntryId)
    : [];

  return (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-black/50 dark:text-white/50">
        {connected ? "Live" : "Connecting…"} &middot; auction status: {state.status}
      </p>

      {myTeam ? (
        <>
          <section className="rounded border border-black/20 dark:border-white/20 px-4 py-3 flex flex-col gap-2">
            <p className="font-medium">{myTeam.teamName} (your team)</p>
            <p className="text-sm text-black/60 dark:text-white/60">
              Budget remaining: {myTeam.budgetRemaining} &middot; Slots: {myTeam.slotsFilled}/
              {myTeam.slotsTotal}
            </p>
            <TeamStrengthSummary players={myPlayers} />
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <section>
              <h2 className="text-lg font-medium mb-3">Your roster</h2>
              <ConfirmedRosterTable
                players={myPlayers
                  .filter((p) => p.status === "SOLD")
                  .map((p) => ({
                    id: p.id,
                    playerName: p.name,
                    categoryName: p.categoryName,
                    soldPrice: p.soldPrice,
                    soldVia: p.soldVia,
                  }))}
              />
            </section>

            <section>
              <h2 className="text-lg font-medium mb-3">On the clock</h2>
              <OnClockCard player={onClock} photoWidth={200} photoHeight={300} />
            </section>
          </div>
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
              <div>
                <p className="text-xl font-semibold">{onClock.name}</p>
                <p className="text-sm text-black/60 dark:text-white/60">
                  {onClock.categoryName} &middot; base price {onClock.basePrice}
                </p>
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
