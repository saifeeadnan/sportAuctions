"use client";

import { useState } from "react";
import { tabsTrack, tabItem, card } from "@/lib/ui";
import { CloseWindowButton } from "@/components/manager/CloseWindowButton";
import { WishlistFeasibilityPanel, type WishlistItemDisplay } from "@/components/manager/WishlistFeasibilityPanel";
import { WishlistStatusBadge } from "@/components/manager/WishlistStatusBadge";
import { AllRostersTable, type AllRostersTeamDisplay } from "@/components/manager/AllRostersTable";
import {
  RivalCategoryEstimateTable,
  type RivalEstimateTeamOption,
  type RivalEstimateCategoryOption,
  type RivalEstimateTeamContext,
  type RivalCategoryEstimateRow,
} from "@/components/manager/RivalCategoryEstimateTable";
import { SetupProgressBanner, type SetupChecklistItem } from "@/components/manager/SetupProgressBanner";
import { LiveBidGuidancePanel } from "@/components/manager/LiveBidGuidancePanel";
import { RosterAffordabilityPanel } from "@/components/manager/RosterAffordabilityPanel";
import { WishlistAndPredictionsPicker } from "@/components/manager/WishlistAndPredictionsPicker";
import { SavedStrategiesBar, type SavedStrategyOption } from "@/components/manager/SavedStrategiesBar";
import { SimulationPanel, type SimulationPlanSummaryDisplay } from "@/components/manager/SimulationPanel";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import { computeRosterAffordability } from "@/lib/auction/rosterAffordability";
import type { WishlistFeasibilitySummary } from "@/lib/auction-analytics/types";
import type { AuctionState } from "@/lib/services/auctionState.service";
import type { PlayerPrediction } from "@/lib/auction/projectedStandings";

type Tab = "live" | "strategy" | "rosters" | "estimates" | "simulate";

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live Analytics" },
  { id: "estimates", label: "Set Budgets" },
  { id: "strategy", label: "Wish list & Predictions" },
  { id: "simulate", label: "Simulate" },
  { id: "rosters", label: "All Rosters" },
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
  activeStrategyName,
  savedStrategies,
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
    initialMustHaveIds: string[];
    initialAvoidIds: string[];
    initialBudgetTargets: { categoryId: string; targetAvgPrice: string }[];
  };
  /** Same shape as InitialStrategy.budgetTargetsByCategoryName — keyed by
   * category *name* to match AuctionStatePlayer.categoryName directly. */
  budgetTargetsByCategoryName: Record<string, number>;
  rivalRosters: AllRostersTeamDisplay[];
  rivalEstimateRows: RivalCategoryEstimateRow[];
  estimateForm: {
    entryId: string;
    teams: RivalEstimateTeamOption[];
    categories: RivalEstimateCategoryOption[];
    initialEstimates: { targetEntryId: string; categoryId: string; estimatedBudget: string }[];
  };
  activeStrategyName: string | null;
  savedStrategies: SavedStrategyOption[];
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
  const myTeam = liveState.teams.find((t) => t.id === myTeamEntryId);

  // For Simulate's pre-run plan summary — resolves the raw ids strategy/
  // predictions store into names using whatever the live socket already
  // knows, no extra fetch.
  const playerNameById = new Map(liveState.players.map((p) => [p.id, p.name]));
  const teamNameById = new Map(liveState.teams.map((t) => [t.id, t.teamName]));
  const planSummary: SimulationPlanSummaryDisplay = {
    budgetTargets: Object.entries(budgetTargetsByCategoryName).map(([categoryName, targetAvgPrice]) => ({
      categoryName,
      targetAvgPrice,
    })),
    mustHaves: strategy.initialMustHaveIds.map((id) => ({ playerId: id, playerName: playerNameById.get(id) ?? id })),
    avoids: strategy.initialAvoidIds.map((id) => ({ playerId: id, playerName: playerNameById.get(id) ?? id })),
    predictions: Object.entries(predictions).map(([playerId, p]) => ({
      playerId,
      playerName: playerNameById.get(playerId) ?? playerId,
      teamName: p.teamId ? teamNameById.get(p.teamId) ?? null : null,
      amount: p.amount,
      minAmount: p.minAmount,
      unsold: p.unsold,
    })),
  };

  // Every team, including self — the merged estimates grid shows the
  // manager's own slots/budget context alongside every rival's.
  const teamContextById: Record<string, RivalEstimateTeamContext> = Object.fromEntries(
    liveState.teams.map((t) => [
      t.id,
      { budgetRemaining: Number(t.budgetRemaining), slotsToFill: t.slotsTotal - t.slotsFilled },
    ])
  );

  const setupItems: SetupChecklistItem[] = [
    {
      key: "strategy",
      label: "Must-haves or avoids set",
      done: strategy.initialMustHaveIds.length > 0 || strategy.initialAvoidIds.length > 0,
    },
    { key: "estimates", label: "Budget targets set", done: strategy.initialBudgetTargets.length > 0 },
    { key: "estimates", label: "Rival estimates set", done: estimateForm.initialEstimates.length > 0 },
    { key: "strategy", label: "Predictions made", done: Object.keys(predictions).length > 0 },
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

        <SavedStrategiesBar
          teamAuctionEntryId={myTeamEntryId}
          activeStrategyName={activeStrategyName}
          savedStrategies={savedStrategies}
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
                  Wish list &amp; predictions
                </summary>
                <div className="px-4 pb-4">
                  <WishlistAndPredictionsPicker
                    entryId={strategy.entryId}
                    players={predictablePlayers}
                    otherTeams={otherTeams}
                    initialMustHaveIds={strategy.initialMustHaveIds}
                    initialAvoidIds={strategy.initialAvoidIds}
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

          {tab === "rosters" && <AllRostersTable rosters={rivalRosters} />}

          {tab === "estimates" && (
            <section className="flex flex-col gap-3">
              <details className={card} open>
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                  Set your budgets
                </summary>
                <div className="px-4 pb-4">
                  <RivalCategoryEstimateTable
                    entryId={estimateForm.entryId}
                    teams={estimateForm.teams}
                    categories={estimateForm.categories}
                    initialEstimates={estimateForm.initialEstimates}
                    teamContextById={teamContextById}
                    analyticsRows={rivalEstimateRows}
                  />
                </div>
              </details>
            </section>
          )}

          {/* Always mounted (hidden via CSS rather than unmounted) so its
              fetched result and selected-run state survive switching to
              another tab and back — same reasoning as the live socket above. */}
          <div className={tab === "simulate" ? "contents" : "hidden"}>
            <SimulationPanel
              teamAuctionEntryId={myTeamEntryId}
              totalSlots={myTeam?.slotsTotal}
              planSummary={planSummary}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
