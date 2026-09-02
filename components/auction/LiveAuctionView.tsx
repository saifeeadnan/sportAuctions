"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AuctionState } from "@/lib/services/auctionState.service";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { TeamBudgetBoard } from "@/components/auction/TeamBudgetBoard";
import { SoldTicker } from "@/components/auction/SoldTicker";
import { OnClockCard } from "@/components/auction/OnClockCard";
import { OnClockTimer } from "@/components/auction/OnClockTimer";
import { SaleAnnouncement } from "@/components/auction/SaleAnnouncement";
import { TeamStrengthSummary } from "@/components/manager/TeamStrengthSummary";
import { RosterRibbon } from "@/components/roster/RosterRibbon";
import { BidControl } from "@/components/auction/BidControl";
import { computeMaxBid } from "@/lib/auction/maxBid";
import { computeBidGuidance, computeLiveCategoryAvgPrice, type InitialStrategy } from "@/lib/auction/guidance";
import { openAnalyticsDashboardWindow, openAnalyticsV2DashboardWindow } from "@/lib/auction/popupWindow";
import { card, tabsTrack, tabItem } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

export type { InitialStrategy };

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
  analyticsEnabled = false,
  initialStrategy,
}: {
  initialState: AuctionState;
  highlightTeamEntryId?: string;
  /** True only when the current session user actually manages
   * `highlightTeamEntryId`'s team — a viewer's own-sold-player highlight
   * must only ever show the live bid, never get bidding controls. */
  canPlaceBids?: boolean;
  /** Premium analytics dashboard, gated per-team-per-auction (§ TeamAuctionEntry.analyticsEnabled).
   * The dashboard itself lives in a separate popup window (/analytics) —
   * this component only needs enough to compute the trigger button's status
   * dot, not the full strategy/prediction data set. */
  analyticsEnabled?: boolean;
  initialStrategy?: InitialStrategy;
}) {
  const router = useRouter();
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

  // Read-only mirror of the auctioneer console's "Remaining pool" — same
  // category tabs and ordering, minus the "Put on clock" action.
  const categoryBasePrices = new Map<string, number>();
  for (const p of queue) {
    if (!categoryBasePrices.has(p.categoryName)) {
      categoryBasePrices.set(p.categoryName, Number(p.basePrice));
    }
  }
  const poolCategories = Array.from(categoryBasePrices.keys()).sort(
    (a, b) => (categoryBasePrices.get(b) ?? 0) - (categoryBasePrices.get(a) ?? 0)
  );
  const [activePoolCategory, setActivePoolCategory] = useState<string>("");
  const effectivePoolCategory =
    activePoolCategory && poolCategories.includes(activePoolCategory)
      ? activePoolCategory
      : (poolCategories[0] ?? "");
  const visiblePool = queue.filter((p) => p.categoryName === effectivePoolCategory);
  const remainingPoolBasePrices = onClock
    ? queue.filter((p) => p.id !== onClock.id).map((p) => Number(p.basePrice))
    : [];
  const myMaxBid =
    myTeam && onClock
      ? computeMaxBid(remainingPoolBasePrices, Number(myTeam.budgetRemaining), myTeam.slotsTotal - myTeam.slotsFilled)
      : null;

  // Other must-have picks still in play in the same category — bidding hard
  // on a non-priority player here could leave too little for those.
  const otherMustHavesRemainingInCategory = onClock
    ? state.players.filter(
        (p) =>
          p.id !== onClock.id &&
          p.categoryName === onClock.categoryName &&
          p.status !== "SOLD" &&
          (initialStrategy?.mustHaveIds.includes(p.id) ?? false)
      ).length
    : 0;

  const guidance =
    analyticsEnabled && onClock
      ? computeBidGuidance({
          basePrice: Number(onClock.basePrice),
          isMustHave: initialStrategy?.mustHaveIds.includes(onClock.id) ?? false,
          isAvoid: initialStrategy?.avoidIds.includes(onClock.id) ?? false,
          categoryTargetAvgPrice: initialStrategy?.budgetTargetsByCategoryName[onClock.categoryName] ?? null,
          liveCategoryAvgPrice: computeLiveCategoryAvgPrice(state.players, onClock.categoryName),
          legalMaxBid: myMaxBid,
          otherMustHavesRemainingInCategory,
          // This view has no prediction data (that's only fetched inside the
          // analytics popup, kept private and off this page) — the status
          // dot below just falls back to a plain PASS for avoid picks here.
          predictedRival: null,
        })
      : null;

  return (
    <div className="flex flex-col gap-4">
      <SaleAnnouncement sale={lastSale} />
      <p className="text-xs text-black/50 dark:text-white/50 flex items-center gap-2">
        <Badge variant={connected ? "success" : "warning"}>{connected ? "Live" : "Connecting…"}</Badge>
        <span>auction status: {state.status}</span>
        <button
          type="button"
          onClick={() => router.refresh()}
          title="Pull in any roster edits (name, photo, rating…) made since this page loaded"
          className="underline underline-offset-2 hover:text-black dark:hover:text-white transition-colors"
        >
          Refresh
        </button>
      </p>

      {myTeam ? (
        <>
          <div className={`${card} px-4 py-2.5 flex flex-col gap-2`}>
            <div className="flex items-center gap-2.5 flex-wrap">
              {myTeam.hasSponsorImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/teams/${myTeam.teamId}/sponsor-image`}
                  alt={`${myTeam.teamName} sponsor`}
                  className="h-10 w-10 rounded object-contain bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 p-1 shrink-0"
                />
              )}
              <p className="font-medium">{myTeam.teamName}</p>
              <span className="text-sm text-black/60 dark:text-white/60">
                Budget remaining <span className="font-semibold text-black dark:text-white">{myTeam.budgetRemaining}</span>
              </span>
              <span className="text-sm text-black/60 dark:text-white/60">
                Slots{" "}
                <span className="font-semibold text-black dark:text-white">
                  {myTeam.slotsFilled}/{myTeam.slotsTotal}
                </span>
              </span>
            </div>
            <TeamStrengthSummary players={myPlayers} squadSize={myTeam.slotsTotal} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <section className={`${card} p-3`}>
              <h2 className="text-base font-medium mb-2">Remaining pool ({queue.length})</h2>
              {poolCategories.length > 0 && (
                <div className={`${tabsTrack} mb-2`}>
                  {poolCategories.map((cat) => {
                    const count = queue.filter((p) => p.categoryName === cat).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActivePoolCategory(cat)}
                        className={tabItem(effectivePoolCategory === cat)}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
              {visiblePool.length === 0 ? (
                <p className="text-sm text-black/60 dark:text-white/60">
                  No remaining players in this category.
                </p>
              ) : (
                <ul className="flex flex-col max-h-[360px] overflow-y-auto">
                  {visiblePool.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-2 py-1 text-sm border-b border-black/5 dark:border-white/5 last:border-0"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{p.name}</span>
                        {p.status === "IN_PRE_AUCTION_POOL" && <Badge variant="warning">Contested</Badge>}
                        {p.status === "UNSOLD" && <Badge variant="neutral">Re-offer</Badge>}
                      </span>
                      <span className="text-black/50 dark:text-white/50 shrink-0">{p.basePrice}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${card} p-3`}>
              <h2 className="text-base font-medium mb-2">On the clock</h2>
              <div className="flex gap-3 items-start">
                <OnClockCard
                  player={onClock}
                  template={state.onClockTemplate}
                  visibleFields={state.onClockVisibleFields}
                  photoWidth={110}
                  photoHeight={150}
                />
                {onClock && (
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <OnClockTimer player={onClock} totalSeconds={state.lotTimerSeconds} />
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
              </div>
            </section>
          </div>

          <section>
            <h2 className="text-base font-medium mb-2">Your roster</h2>
            <RosterRibbon
              players={myPlayers
                .filter((p) => p.status === "SOLD")
                .map((p) => ({
                  id: p.id,
                  playerName: p.name,
                  photoUrl: p.photoUrl,
                  position: p.position,
                  soldPrice: p.soldPrice,
                  isCaptain: p.isCaptain,
                }))}
            />
          </section>
        </>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-medium mb-3">On the clock</h2>
            <div className="flex flex-col gap-2 items-start">
              <OnClockCard
                player={onClock}
                template={state.onClockTemplate}
                visibleFields={state.onClockVisibleFields}
                photoWidth={96}
                photoHeight={128}
              />
              {onClock && <OnClockTimer player={onClock} totalSeconds={state.lotTimerSeconds} />}
              {onClock && <CurrentBidLine player={onClock} />}
            </div>
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

      {analyticsEnabled && myTeam && (
        <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => openAnalyticsV2DashboardWindow(myTeam.id)}
            className="inline-flex items-center gap-2 rounded-full border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 pl-4 pr-5 py-2 text-sm font-medium shadow-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.06] transition-colors"
          >
            Analytics v2 (beta) ↗
          </button>
          <button
            type="button"
            onClick={() => openAnalyticsDashboardWindow(myTeam.id)}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 dark:bg-indigo-500 text-white pl-4 pr-5 py-2.5 text-sm font-medium shadow-lg hover:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
          >
            {guidance && (
              <span
                className={`h-2 w-2 rounded-full ${
                  guidance.signal === "BID"
                    ? "bg-emerald-400"
                    : guidance.signal === "PASS"
                      ? "bg-amber-400"
                      : guidance.signal === "SPOILER"
                        ? "bg-red-400"
                        : "bg-white/70"
                }`}
                aria-hidden
              />
            )}
            Analytics ↗
          </button>
        </div>
      )}
    </div>
  );
}
