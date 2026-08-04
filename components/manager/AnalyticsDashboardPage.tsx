"use client";

import { useState } from "react";
import { useAuctionSocket } from "@/hooks/useAuctionSocket";
import type { AuctionState } from "@/lib/services/auctionState.service";
import { computeMaxBid } from "@/lib/auction/maxBid";
import { computeBidGuidance, computeLiveCategoryAvgPrice, type InitialStrategy } from "@/lib/auction/guidance";
import {
  computeProjectedStandings,
  computeRivalAffordabilityWarnings,
  computeCategorySpendOverview,
  type PlayerPrediction,
} from "@/lib/auction/projectedStandings";
import { BidGuidancePanel } from "@/components/manager/BidGuidancePanel";
import { TeamProjectionBoard } from "@/components/manager/TeamProjectionBoard";
import { RivalAffordabilityPanel } from "@/components/manager/RivalAffordabilityPanel";
import { CategorySpendTable } from "@/components/manager/CategorySpendTable";
import { PredictionPicker } from "@/components/manager/PredictionPicker";
import {
  StrategyForm,
  type StrategyCategoryOption,
  type StrategyPlayerOption,
} from "@/components/manager/StrategyForm";
import { card, tabsTrack, tabItem } from "@/lib/ui";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

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

  // Your own prediction for whoever's on the clock right now, if you made
  // one — a rival team can only ever appear here via your own guess, never
  // theirs, since predictions are private per team.
  const onClockPrediction = onClock ? predictions[onClock.id] : undefined;
  const onClockPredictionTeamName = onClockPrediction
    ? state.teams.find((t) => t.id === onClockPrediction.teamId)?.teamName
    : undefined;

  // Actual average sold price for the on-clock player's category so far —
  // a live, objective fallback wherever a target price is needed and the
  // manager hasn't set one.
  const liveCategoryAvgPrice = onClock
    ? computeLiveCategoryAvgPrice(state.players, onClock.categoryName)
    : null;

  const guidance = onClock
    ? computeBidGuidance({
        basePrice: Number(onClock.basePrice),
        isMustHave: initialStrategy.mustHaveIds.includes(onClock.id),
        isAvoid: initialStrategy.avoidIds.includes(onClock.id),
        categoryTargetAvgPrice: initialStrategy.budgetTargetsByCategoryName[onClock.categoryName] ?? null,
        liveCategoryAvgPrice,
        legalMaxBid: myMaxBid,
        otherMustHavesRemainingInCategory,
        predictedRival:
          onClockPredictionTeamName != null
            ? { teamName: onClockPredictionTeamName, amount: onClockPrediction?.amount ?? null }
            : null,
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
  const affordabilityWarnings = computeRivalAffordabilityWarnings(projections);
  const categorySpend = computeCategorySpendOverview(state.players, predictions);

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
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-medium">Bidding guidance</h2>
                  <HelpTooltip title="Bidding guidance">
                    <p>
                      Four signals: <span className="font-medium">Bid</span> (go for it),{" "}
                      <span className="font-medium">Consider</span> (in range, but not a
                      priority), <span className="font-medium">Pass</span>, and{" "}
                      <span className="font-medium">Spoiler bid</span> (bid up a player you
                      predicted a rival wants, without intending to win it — risky, since you
                      could end up winning it anyway). The suggested max is always capped at
                      your legal max, so it never suggests a bid the platform would reject.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Example:</span> Kohli is on the clock, base
                      300. You marked him must-have and your legal max is 900 → <b>Bid</b>,
                      suggested max 900. A non-priority player in a category with a 400 budget
                      target and the same 900 legal max → <b>Consider</b>, suggested max 400.
                    </p>
                  </HelpTooltip>
                </div>
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
                    {onClockPredictionTeamName && guidance.signal !== "SPOILER" && (
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
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-medium">Projected standings</h2>
                  <HelpTooltip title="Projected standings">
                    <p>
                      &quot;Purse left&quot; is real. &quot;Predicted reserve&quot; is what{" "}
                      <span className="font-medium">your own predictions</span> say that team
                      will still spend — not a fact about them. Each category cell reads{" "}
                      <span className="font-medium">sold (predicted)</span>: players already won,
                      plus players you predict they&apos;ll still win.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Example:</span> Titans FC shows Purse left
                      2,400, Predicted reserve 1,100 — that 1,100 is your guess, not theirs. Their
                      Icon column reading &quot;2 (1)&quot; means 2 already sold to them, plus 1
                      more you predict they&apos;ll win.
                    </p>
                  </HelpTooltip>
                </div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Budget, reserve, and roster by category (highest base price first) — each cell is
                  sold count, with predicted-but-not-yet-sold in parentheses. Your team is
                  highlighted.
                </p>
                <TeamProjectionBoard projections={projections} myTeamId={myTeamId} />
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-medium">Category spend</h2>
                  <HelpTooltip title="Category spend">
                    <p>
                      &quot;Avg spent&quot; is the real average sold price so far in that
                      category. &quot;Avg predicted&quot; is the average of{" "}
                      <span className="font-medium">your own</span> predicted amounts for
                      players still available in it. Side by side, they&apos;re a sanity check on
                      your budget targets — never another team&apos;s data.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Example:</span> Icon shows Avg spent 450 (6
                      sold) and Avg predicted 380 (2 predicted) — the category is running hotter
                      than your assumptions, so your remaining budget target for Icon may be too
                      low.
                    </p>
                  </HelpTooltip>
                </div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Real average price paid so far per category vs. the average your own predictions
                  assume for what&apos;s still to come.
                </p>
                <CategorySpendTable rows={categorySpend} />
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-medium">Prediction sanity check</h2>
                  <HelpTooltip title="Prediction sanity check">
                    <p>
                      Flags a team when the amounts <span className="font-medium">you</span>{" "}
                      predicted for their still-available picks add up to more than their real
                      remaining budget can cover. It&apos;s a check on your own predictions, not
                      a comment on their strategy.
                    </p>
                    <p className="mt-2">
                      <span className="font-medium">Example:</span> You predicted Titans FC will
                      win 3 more players for a combined 2,800, but they only have 2,200 left —
                      flagged as over by 600, meaning some of those predictions can&apos;t all be
                      true at those prices.
                    </p>
                  </HelpTooltip>
                </div>
                <p className="text-xs text-black/50 dark:text-white/50">
                  Flags any team where your own predicted-win amounts add up to more than their
                  real remaining budget — a check on your predictions, not a comment on their
                  strategy.
                </p>
                <RivalAffordabilityPanel warnings={affordabilityWarnings} />
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
