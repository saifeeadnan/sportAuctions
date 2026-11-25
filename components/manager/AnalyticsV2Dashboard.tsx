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
import { SetupProgressBanner, type SetupChecklistItem } from "@/components/manager/SetupProgressBanner";
import { LiveBidGuidancePanel } from "@/components/manager/LiveBidGuidancePanel";
import { RosterAffordabilityPanel } from "@/components/manager/RosterAffordabilityPanel";
import { V2PredictionPicker } from "@/components/manager/V2PredictionPicker";
import { SimulationPanel } from "@/components/manager/SimulationPanel";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { computeRosterAffordability } from "@/lib/auction/rosterAffordability";
import type { WishlistFeasibilitySummary } from "@/lib/auction-analytics/types";
import type { AuctionState } from "@/lib/services/auctionState.service";
import type { PlayerPrediction } from "@/lib/auction/projectedStandings";

type Tab = "live" | "strategy" | "predictions" | "rosters" | "estimates" | "simulate";

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live Analytics" },
  { id: "strategy", label: "Strategy" },
  { id: "predictions", label: "Predictions" },
  { id: "rosters", label: "All Rosters" },
  { id: "estimates", label: "My estimates" },
  { id: "simulate", label: "Simulate" },
];

// v2's own copy of which statuses are still predictable — deliberately not
// imported from v1's AnalyticsDashboardPage.tsx, to keep the two dashboards
// independent at the UI layer even though they predict against the same
// underlying AuctionPlayerPrediction data.
const V2_PREDICTABLE_STATUSES = new Set(["AVAILABLE", "IN_PRE_AUCTION_POOL", "IN_BIDDING", "UNSOLD"]);

export function AnalyticsV2Dashboard({
  auctionId,
  initialState,
  myTeamEntryId,
  auctionName,
  tournamentName,
  wishlistItems,
  wishlistSummary,
  strategy,
  initialPredictions,
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
  initialPredictions: Record<string, PlayerPrediction>;
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
  const [predictions, setPredictions] = useState<Record<string, PlayerPrediction>>(initialPredictions);

  const predictablePlayers = liveState.players.filter((p) => V2_PREDICTABLE_STATUSES.has(p.status));
  const otherTeams = liveState.teams.filter((t) => t.id !== myTeamEntryId);

  const setupItems: SetupChecklistItem[] = [
    {
      key: "strategy",
      label: "Must-haves or avoids set",
      done: strategy.initialMustHaveIds.length > 0 || strategy.initialAvoidIds.length > 0,
    },
    { key: "strategy", label: "Budget targets set", done: strategy.initialBudgetTargets.length > 0 },
    { key: "estimates", label: "Rival estimates set", done: estimateForm.initialEstimates.length > 0 },
    { key: "predictions", label: "Predictions made", done: Object.keys(predictions).length > 0 },
  ];

  return (
    // fixed inset-0 — this popup fills its own window edge to edge rather
    // than sitting inside the manager section's normal layout (which would
    // otherwise show the Tournaments/Fantasy teams nav above it).
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-neutral-950 text-black dark:text-white">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 flex-1 min-h-0">
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

        <SetupProgressBanner
          storageKey={`analytics-v2-setup:${myTeamEntryId}`}
          items={setupItems}
          onJump={(key) => setTab(key as Tab)}
        />

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

          {tab === "predictions" && (
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-sm font-medium">Who wins each remaining player?</h2>
                <p className="text-xs text-black/60 dark:text-white/60">
                  Your own private guesses, grouped by category — never visible to any other team. Also
                  feeds the Simulate tab: a predicted player resolves to the team you picked in every run.
                </p>
              </div>
              <V2PredictionPicker
                entryId={myTeamEntryId}
                players={predictablePlayers}
                otherTeams={otherTeams}
                predictions={predictions}
                onPredictionChange={(playerId, prediction) => {
                  setPredictions((prev) => {
                    const next = { ...prev };
                    if (prediction) {
                      next[playerId] = prediction;
                    } else {
                      delete next[playerId];
                    }
                    return next;
                  });
                }}
              />
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

          {/* Always mounted (hidden via CSS rather than unmounted) so its
              fetched result and selected-run state survive switching to
              another tab and back — same reasoning as the live socket above. */}
          <div className={tab === "simulate" ? "contents" : "hidden"}>
            <SimulationPanel teamAuctionEntryId={myTeamEntryId} />
          </div>
        </div>
      </div>
    </div>
  );
}
