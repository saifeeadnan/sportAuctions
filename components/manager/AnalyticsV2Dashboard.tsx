"use client";

import { useState } from "react";
import { tabsTrack, tabItem, card } from "@/lib/ui";
import { CloseWindowButton } from "@/components/manager/CloseWindowButton";
import { WishlistFeasibilityPanel, type WishlistItemDisplay } from "@/components/manager/WishlistFeasibilityPanel";
import { WishlistStatusBadge } from "@/components/manager/WishlistStatusBadge";
import { RivalRostersPanel, type RivalRosterDisplay } from "@/components/manager/RivalRostersPanel";
import {
  RivalCategoryEstimateForm,
  type RivalEstimateTeamOption,
  type RivalEstimateCategoryOption,
} from "@/components/manager/RivalCategoryEstimateForm";
import { RivalCategoryEstimatePanel, type RivalCategoryEstimateRow } from "@/components/manager/RivalCategoryEstimatePanel";
import { StrategyForm, type StrategyCategoryOption, type StrategyPlayerOption } from "@/components/manager/StrategyForm";
import { LiveBidGuidancePanel } from "@/components/manager/LiveBidGuidancePanel";
import { RosterAffordabilityPanel } from "@/components/manager/RosterAffordabilityPanel";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { computeRosterAffordability } from "@/lib/auction/rosterAffordability";
import type { WishlistFeasibilitySummary } from "@/lib/auction-analytics/types";
import type { AuctionState } from "@/lib/services/auctionState.service";

type Tab = "live" | "strategy" | "rosters" | "estimates";

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live Analytics" },
  { id: "strategy", label: "Strategy" },
  { id: "rosters", label: "All Rosters" },
  { id: "estimates", label: "My estimates" },
];

export function AnalyticsV2Dashboard({
  auctionId,
  initialState,
  myTeamEntryId,
  auctionName,
  tournamentName,
  wishlistItems,
  wishlistSummary,
  strategy,
  budgetTargetsByCategoryName,
  rivalRosters,
  rivalEstimateRows,
  estimateForm,
}: {
  auctionId: string;
  initialState: AuctionState;
  myTeamEntryId: string;
  auctionName: string;
  tournamentName: string;
  wishlistItems: WishlistItemDisplay[];
  wishlistSummary: WishlistFeasibilitySummary;
  strategy: {
    entryId: string;
    categories: StrategyCategoryOption[];
    players: StrategyPlayerOption[];
    initialMustHaveIds: string[];
    initialAvoidIds: string[];
    initialBudgetTargets: { categoryId: string; targetAvgPrice: string }[];
  };
  /** Same shape as InitialStrategy.budgetTargetsByCategoryName — keyed by
   * category *name* to match AuctionStatePlayer.categoryName directly. */
  budgetTargetsByCategoryName: Record<string, number>;
  rivalRosters: RivalRosterDisplay[];
  rivalEstimateRows: RivalCategoryEstimateRow[];
  estimateForm: {
    entryId: string;
    teams: RivalEstimateTeamOption[];
    categories: RivalEstimateCategoryOption[];
    initialEstimates: { targetEntryId: string; categoryId: string; estimatedBudget: string }[];
  };
}) {
  const [tab, setTab] = useState<Tab>("live");
  // Owned here, not inside LiveBidGuidancePanel — that panel only renders
  // while the "live" tab is active, so a socket connection scoped to it
  // would disconnect and reset back to the stale page-load initialState
  // every time the manager switched tabs and back. One connection for the
  // whole popup's lifetime, passed down instead.
  const { state: liveState, connected } = useAuctionSocket(auctionId, initialState);

  return (
    // fixed inset-0 — this popup fills its own window edge to edge rather
    // than sitting inside the manager section's normal layout (which would
    // otherwise show the Tournaments/Fantasy teams nav above it).
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-neutral-950 text-black dark:text-white">
      <div className="max-w-4xl w-full mx-auto px-8 py-6 flex flex-col gap-6 flex-1 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-semibold mb-1">
              Analytics v2 <span className="text-black/50 dark:text-white/50 font-normal text-sm">(beta)</span>
            </h1>
            <p className="text-sm text-black/60 dark:text-white/60">
              {auctionName} &middot; {tournamentName}
            </p>
          </div>
          <CloseWindowButton />
        </div>

        <div className={`${tabsTrack} self-start shrink-0`}>
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={tabItem(tab === t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6">
          {tab === "live" && (
            <div className="flex flex-col gap-6">
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">On the clock</h2>
                <LiveBidGuidancePanel
                  state={liveState}
                  connected={connected}
                  myTeamEntryId={myTeamEntryId}
                  mustHaveIds={strategy.initialMustHaveIds}
                  avoidIds={strategy.initialAvoidIds}
                  budgetTargetsByCategoryName={budgetTargetsByCategoryName}
                />
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Roster affordability</h2>
                <RosterAffordabilityPanel
                  rows={computeRosterAffordability(liveState.teams, liveState.players)}
                  myTeamId={myTeamEntryId}
                />
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Wishlist status</h2>
                <WishlistStatusBadge summary={wishlistSummary} hasItems={wishlistItems.length > 0} />
              </section>
            </div>
          )}

          {tab === "strategy" && (
            <div className="flex flex-col gap-3">
              <details className={card} open>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  Set strategy
                </summary>
                <div className="px-4 pb-4">
                  <StrategyForm
                    entryId={strategy.entryId}
                    categories={strategy.categories}
                    players={strategy.players}
                    initialMustHaveIds={strategy.initialMustHaveIds}
                    initialAvoidIds={strategy.initialAvoidIds}
                    initialBudgetTargets={strategy.initialBudgetTargets}
                  />
                </div>
              </details>

              <details className={card} open>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  My wishlist
                </summary>
                <div className="px-4 pb-4">
                  <WishlistFeasibilityPanel items={wishlistItems} />
                </div>
              </details>
            </div>
          )}

          {tab === "rosters" && <RivalRostersPanel rosters={rivalRosters} />}

          {tab === "estimates" && (
            <section className="flex flex-col gap-3">
              <details className={card}>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  Set your estimates
                </summary>
                <div className="px-4 pb-4">
                  <RivalCategoryEstimateForm
                    entryId={estimateForm.entryId}
                    teams={estimateForm.teams}
                    categories={estimateForm.categories}
                    initialEstimates={estimateForm.initialEstimates}
                  />
                </div>
              </details>
              <RivalCategoryEstimatePanel rows={rivalEstimateRows} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
