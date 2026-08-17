"use client";

import type { AuctionState } from "@/lib/services/auctionState.service";
import { computeMaxBid } from "@/lib/auction/maxBid";
import { computeBidGuidance, computeLiveCategoryAvgPrice, type GuidanceSignal } from "@/lib/auction/guidance";
import { card } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";

const SIGNAL_VARIANT: Record<GuidanceSignal, "success" | "info" | "warning" | "danger"> = {
  BID: "success",
  CONSIDER: "info",
  PASS: "warning",
  SPOILER: "danger",
};

/**
 * Live-mode bid guidance for whoever's currently on the clock — the same
 * computeBidGuidance/computeMaxBid logic v1's LiveAuctionView already uses,
 * just surfaced as its own panel here. Deliberately only reads "who's on
 * the clock and what's the current bid" from the live socket state, not
 * anything else about it — so a future offline/CSV session (Mode 2, no
 * live auction system to subscribe to) can feed this exact same
 * computation from a manually-entered player + bid price instead, without
 * this panel's guidance logic needing to change at all.
 *
 * Takes the live state/connected pair as props rather than calling
 * useAuctionSocket itself — this panel only renders while the "live" tab
 * is active, so a socket connection scoped to it would disconnect and
 * reset to the stale page-load snapshot every time the manager switched
 * tabs and back. AnalyticsV2Dashboard owns the one connection instead.
 */
export function LiveBidGuidancePanel({
  state,
  connected,
  myTeamEntryId,
  mustHaveIds,
  avoidIds,
  budgetTargetsByCategoryName,
}: {
  state: AuctionState;
  connected: boolean;
  myTeamEntryId: string;
  mustHaveIds: string[];
  avoidIds: string[];
  budgetTargetsByCategoryName: Record<string, number>;
}) {
  const onClock = state.players.find((p) => p.status === "IN_BIDDING");
  const myTeam = state.teams.find((t) => t.id === myTeamEntryId);

  if (!myTeam) return null;

  if (!onClock) {
    return (
      <div className={`${card} px-4 py-2 flex items-center gap-2 text-sm`}>
        <Badge variant={connected ? "success" : "warning"}>{connected ? "Live" : "Connecting…"}</Badge>
        <span className="text-black/60 dark:text-white/60">No player currently on the clock.</span>
      </div>
    );
  }

  const queue = state.players.filter(
    (p) => p.status === "AVAILABLE" || p.status === "IN_PRE_AUCTION_POOL" || p.status === "UNSOLD"
  );
  const remainingPoolBasePrices = queue.filter((p) => p.id !== onClock.id).map((p) => Number(p.basePrice));
  const legalMaxBid = computeMaxBid(
    remainingPoolBasePrices,
    Number(myTeam.budgetRemaining),
    myTeam.slotsTotal - myTeam.slotsFilled
  );

  const otherMustHavesRemainingInCategory = state.players.filter(
    (p) =>
      p.id !== onClock.id &&
      p.categoryName === onClock.categoryName &&
      p.status !== "SOLD" &&
      mustHaveIds.includes(p.id)
  ).length;

  const guidance = computeBidGuidance({
    basePrice: Number(onClock.basePrice),
    isMustHave: mustHaveIds.includes(onClock.id),
    isAvoid: avoidIds.includes(onClock.id),
    categoryTargetAvgPrice: budgetTargetsByCategoryName[onClock.categoryName] ?? null,
    liveCategoryAvgPrice: computeLiveCategoryAvgPrice(state.players, onClock.categoryName),
    legalMaxBid,
    otherMustHavesRemainingInCategory,
    // v2 has no Predictions tab / prediction data — the avoid/spoiler path
    // just falls back to a plain PASS, same simplification the read-only
    // viewer/manager watch page already makes.
    predictedRival: null,
  });

  return (
    <div className={`${card} px-4 py-2 flex flex-col gap-1`}>
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={connected ? "success" : "warning"}>{connected ? "Live" : "Connecting…"}</Badge>
        <span className="font-medium shrink-0">{onClock.name}</span>
        <span className="text-black/60 dark:text-white/60 truncate min-w-0 flex-1">
          {onClock.categoryName} &middot; base {onClock.basePrice}
          {onClock.currentBid ? (
            <>
              {" "}
              &middot; bid <span className="font-medium text-black dark:text-white">{onClock.currentBid}</span> by{" "}
              {onClock.currentBidderTeamName}
            </>
          ) : (
            " · no bids yet"
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={SIGNAL_VARIANT[guidance.signal]}>{guidance.signal}</Badge>
        {guidance.suggestedMaxBid != null && (
          <span className="text-black/70 dark:text-white/70 shrink-0">
            max <span className="font-medium">{Math.round(guidance.suggestedMaxBid)}</span>
          </span>
        )}
        <span className="text-black/60 dark:text-white/60 truncate min-w-0 flex-1">{guidance.reason}</span>
      </div>
    </div>
  );
}
