"use client";

import { useState } from "react";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import type { AuctionState } from "@/lib/services/auctionState.service";
import { computeMaxBid } from "@/lib/auction/maxBid";
import { computeBidGuidance, type InitialStrategy } from "@/lib/auction/guidance";
import { computeProjectedStandings, type PlayerPrediction } from "@/lib/auction/projectedStandings";
import { BidGuidancePanel } from "@/components/manager/BidGuidancePanel";
import { TeamProjectionBoard } from "@/components/manager/TeamProjectionBoard";
import { PredictionPicker } from "@/components/manager/PredictionPicker";
import {
  StrategyForm,
  type StrategyCategoryOption,
  type StrategyPlayerOption,
} from "@/components/manager/StrategyForm";
import { card, tabsTrack, tabItem } from "@/lib/ui";

const PREDICTABLE_STATUSES = new Set(["AVAILABLE", "IN_PRE_AUCTION_POOL", "IN_BIDDING", "UNSOLD"]);

type Tab = "live" | "strategy" | "predictions";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${card} px-4 py-3 flex flex-col gap-0.5`}>
      <span className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The analytics dashboard as its own standalone page, meant to be opened in
 * a separate popup browser window (lib/auction/popupWindow.ts) rather than
 * as an in-page overlay — it holds its own Socket.IO connection so it stays
 * live independent of the main live-bidding window/tab.
 */
export function AnalyticsDashboardPage({
  initialState,
  myTeamId,
  initialStrategy,
  initialPredictions,
  strategyCategories,
  strategyPlayers,
}: {
  initialState: AuctionState;
  myTeamId: string;
  initialStrategy: InitialStrategy;
  initialPredictions: Record<string, PlayerPrediction>;
  strategyCategories: StrategyCategoryOption[];
  strategyPlayers: StrategyPlayerOption[];
}) {
  const { state, connected } = useAuctionSocket(initialState.id, initialState);
  const [tab, setTab] = useState<Tab>("live");
  const [predictions, setPredictions] = useState<Record<string, PlayerPrediction>>(initialPredictions);

  const onClock = state.players.find((p) => p.status === "IN_BIDDING");
  const myTeam = state.teams.find((t) => t.id === myTeamId);
  const otherTeams = myTeam ? state.teams.filter((t) => t.id !== myTeam.id) : [];

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

  // Other must-have picks still in play in the same category — bidding hard
  // on a non-priority player here could leave too little for those.
  const otherMustHavesRemainingInCategory = onClock
    ? state.players.filter(
        (p) =>
          p.id !== onClock.id &&
          p.categoryName === onClock.categoryName &&
          p.status !== "SOLD" &&
          initialStrategy.mustHaveIds.includes(p.id)
      ).length
    : 0;

  const guidance = onClock
    ? computeBidGuidance({
        basePrice: Number(onClock.basePrice),
        isMustHave: initialStrategy.mustHaveIds.includes(onClock.id),
        isAvoid: initialStrategy.avoidIds.includes(onClock.id),
        categoryTargetAvgPrice: initialStrategy.budgetTargetsByCategoryName[onClock.categoryName] ?? null,
        legalMaxBid: myMaxBid,
        otherMustHavesRemainingInCategory,
      })
    : null;

  const predictablePlayers = state.players.filter((p) => PREDICTABLE_STATUSES.has(p.status));

  // strategyPlayers is a server-fetched snapshot (categoryId isn't part of
  // the live socket state) — filtered live so a player who sells mid-auction
  // drops out of the must-have/avoid picker immediately.
  const soldPlayerIds = new Set(state.players.filter((p) => p.status === "SOLD").map((p) => p.id));
  const livePickableStrategyPlayers = strategyPlayers.filter((p) => !soldPlayerIds.has(p.id));

  const projections = computeProjectedStandings(state.players, state.teams, predictions);
  const myRank = projections.findIndex((p) => p.teamId === myTeamId) + 1;
  const myProjection = projections.find((p) => p.teamId === myTeamId);
  const predictionsCount = Object.keys(predictions).length;

  // Your own prediction for whoever's on the clock right now, if you made
  // one — a rival team can only ever appear here via your own guess, never
  // theirs, since predictions are private per team.
  const onClockPrediction = onClock ? predictions[onClock.id] : undefined;
  const onClockPredictionTeamName = onClockPrediction
    ? state.teams.find((t) => t.id === onClockPrediction.teamId)?.teamName
    : undefined;

  return (
    // Fixed + inset-0 deliberately escapes app/manager/layout.tsx's
    // `max-w-4xl px-4 py-8` wrapper — this page is meant to fill its own
    // popup window edge to edge, not sit inside the manager section's
    // normal content column.
    <div className="fixed inset-0 flex flex-col bg-white dark:bg-neutral-950 text-black dark:text-white">
      <div className="max-w-7xl w-full mx-auto px-8 py-6 flex flex-col gap-6 flex-1 min-h-0">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl font-semibold">Analytics dashboard</h1>
            <p className="text-sm text-black/60 dark:text-white/60">
              {state.name} &middot; {state.tournamentName} &middot; {connected ? "Live" : "Connecting…"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.close()}
            className="text-sm underline underline-offset-2 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
          >
            Close window
          </button>
        </div>

        <div className={`${tabsTrack} self-start shrink-0`}>
          <button type="button" onClick={() => setTab("live")} className={tabItem(tab === "live")}>
            Live analytics
          </button>
          <button
            type="button"
            onClick={() => setTab("strategy")}
            className={tabItem(tab === "strategy")}
          >
            Strategy
          </button>
          <button
            type="button"
            onClick={() => setTab("predictions")}
            className={tabItem(tab === "predictions")}
          >
            Predictions
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === "live" && (
            <div className="flex flex-col gap-6 max-w-5xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatTile
                  label="Your rank"
                  value={myRank > 0 ? `#${myRank} of ${projections.length}` : "—"}
                />
                <StatTile
                  label="Projected strength"
                  value={myProjection ? `${myProjection.projectedStrength.teamStrength.toFixed(1)} / 10` : "—"}
                />
                <StatTile
                  label="Predictions made"
                  value={`${predictionsCount} / ${predictablePlayers.length}`}
                />
              </div>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Bidding guidance</h2>
                {onClock && guidance ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-sm">
                      <span className="font-medium">{onClock.name}</span> is on the clock
                    </p>
                    <BidGuidancePanel
                      signal={guidance.signal}
                      suggestedMaxBid={guidance.suggestedMaxBid}
                      reason={guidance.reason}
                    />
                    {onClockPredictionTeamName && (
                      <p className="text-xs text-black/60 dark:text-white/60">
                        Your prediction:{" "}
                        <span className="font-medium text-black dark:text-white">
                          {onClockPredictionTeamName}
                        </span>{" "}
                        might win this
                        {onClockPrediction?.amount != null
                          ? ` for around ${onClockPrediction.amount.toLocaleString()}`
                          : ""}
                        .
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-black/50 dark:text-white/50">
                    No player is currently on the clock.
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Projected standings</h2>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Bar shows projected team strength out of 10 — sold players plus your own
                  predictions for who wins each remaining one. Your team is highlighted.
                </p>
                <TeamProjectionBoard projections={projections} myTeamId={myTeamId} />
              </section>
            </div>
          )}

          {tab === "strategy" && (
            <div className="flex flex-col gap-6 max-w-5xl">
              <section className="flex flex-col gap-3">
                <div>
                  <h2 className="text-sm font-medium">Your strategy</h2>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    Adjust must-haves, avoids, and budget targets any time — changes apply
                    immediately to the guidance in the Live analytics tab, including for whichever
                    player is on the clock right now.
                  </p>
                </div>
                <StrategyForm
                  entryId={myTeamId}
                  categories={strategyCategories}
                  players={livePickableStrategyPlayers}
                  initialMustHaveIds={initialStrategy.mustHaveIds}
                  initialAvoidIds={initialStrategy.avoidIds}
                  initialBudgetTargets={initialStrategy.budgetTargets}
                />
              </section>
            </div>
          )}

          {tab === "predictions" && (
            <div className="flex flex-col gap-3 max-w-5xl">
              <div>
                <h2 className="text-sm font-medium">Who wins each remaining player?</h2>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Your own private guesses, grouped by category — pick a team and, optionally, how
                  much you think they&apos;d pay. Combined with real sold-player data to build the
                  projected standings and each team&apos;s predicted reserve in the Live analytics tab.
                  Never visible to any other team.
                </p>
              </div>
              <PredictionPicker
                entryId={myTeamId}
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
        </div>
      </div>
    </div>
  );
}
