"use client";

import { useState } from "react";
import { buttonSecondary, card, inputClass, tabsTrack, tabItem } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import {
  runAuctionSimulationAction,
  type SimulationRunDisplay,
  type SimulationSummaryDisplay,
  type SimulationShortfallDisplay,
} from "@/lib/actions/auctionSimulation.actions";
import { RivalRostersPanel } from "@/components/manager/RivalRostersPanel";

// Always shown, per-completed-or-not — the status itself (and, when short,
// a best-effort reason) is the point, not just the scorecard that follows.
function CompletionStatus({
  completeRunCount,
  totalRunCount,
  minSquadSize,
  totalSlots,
  shortfall,
}: {
  completeRunCount: number;
  totalRunCount: number;
  minSquadSize: number;
  totalSlots?: number;
  shortfall: SimulationShortfallDisplay | null;
}) {
  const allComplete = completeRunCount === totalRunCount;
  const slots = shortfall ? Math.round(shortfall.avgSlotsStillNeeded) : 0;
  const lost = shortfall ? Math.round(shortfall.avgEligibleLotsLostToRivals) : 0;
  const unsold = shortfall ? Math.round(shortfall.avgLotsWentUnsoldWhileEligible) : 0;
  const isLoweredBar = totalSlots != null && minSquadSize < totalSlots;
  return (
    <div className={`${card} p-4 flex flex-col gap-2`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={allComplete ? "success" : completeRunCount > 0 ? "warning" : "danger"}>
          {completeRunCount}/{totalRunCount} reached {minSquadSize}+ players
        </Badge>
        {isLoweredBar && (
          <span className="text-xs text-black/60 dark:text-white/60">
            {`Judged against a minimum of ${minSquadSize} players, not the full ${totalSlots}-player squad.`}
          </span>
        )}
        {!allComplete && (
          <span className="text-xs text-black/60 dark:text-white/60">
            {completeRunCount > 0
              ? "The scorecard below only reflects the completed runs."
              : "None completed — the scorecard below reflects the incomplete runs instead."}
          </span>
        )}
      </div>
      {shortfall && (
        <div className="text-sm text-black/70 dark:text-white/70 flex flex-col gap-1">
          <p>
            {`On average ${slots} slot${slots === 1 ? "" : "s"} short, across the ${shortfall.incompleteRunCount} run${
              shortfall.incompleteRunCount === 1 ? "" : "s"
            } that didn't complete:`}
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-0.5">
            {shortfall.ranOutOfLegalBudgetRunCount > 0 && (
              <li>
                {`Ran out of legal budget entirely in ${shortfall.ranOutOfLegalBudgetRunCount} of those runs — a hard budget wall, not just lost bids.`}
              </li>
            )}
            {lost > 0 && (
              <li>{`Lost ${lost} affordable pick${lost === 1 ? "" : "s"} per run to a rival who bid higher.`}</li>
            )}
            {unsold > 0 && (
              <li>
                {`${unsold} affordable pick${unsold === 1 ? "" : "s"} per run went completely unsold — likely because bidding risked affording another still-pending must-have or one of your remaining slots, not necessarily an avoid tag.`}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// A thin, rounded likelihood bar with its own % printed beside it (never
// color alone) — status-colored via the same success/warning/danger hues
// as Badge, so a bar and a badge never disagree about what a color means.
function LikelihoodBar({ fraction, variant }: { fraction: number; variant: "success" | "warning" | "danger" }) {
  const fillClass = variant === "success" ? "bg-emerald-500" : variant === "warning" ? "bg-amber-500" : "bg-red-500";
  const pct = Math.round(fraction * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden shrink-0">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-black/70 dark:text-white/70 w-8 text-right">{pct}%</span>
    </div>
  );
}

const tableHead = "text-left border-b border-black/10 dark:border-white/10";
const tableRow = "border-b border-black/5 dark:border-white/5 last:border-0";

export type SimulationPlanSummaryDisplay = {
  budgetTargets: { categoryName: string; targetAvgPrice: number }[];
  mustHaves: { playerId: string; playerName: string }[];
  avoids: { playerId: string; playerName: string }[];
  predictions: {
    playerId: string;
    playerName: string;
    teamName: string | null;
    amount: number | null;
    minAmount: number | null;
    unsold: boolean;
  }[];
};

// Shown above the Run controls, before a result exists, so the manager can
// sanity-check what they're about to simulate against — a wrong budget
// target or a forgotten must-have is a lot cheaper to catch here than after
// reading 100 runs' worth of outcomes.
function PlanSummary({ summary }: { summary: SimulationPlanSummaryDisplay }) {
  const hasBudgets = summary.budgetTargets.length > 0;
  const hasWishlist = summary.mustHaves.length > 0 || summary.avoids.length > 0;
  const hasPredictions = summary.predictions.length > 0;

  function describePrediction(p: SimulationPlanSummaryDisplay["predictions"][number]) {
    if (p.unsold) return "Unsold";
    const parts: string[] = [];
    if (p.teamName) parts.push(p.teamName);
    if (p.amount != null) parts.push(Math.round(p.amount).toLocaleString());
    else if (p.minAmount != null) parts.push(`${Math.round(p.minAmount).toLocaleString()}+`);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }

  return (
    <details className={card} open>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Your plan for this simulation
      </summary>
      <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
            Budgets{hasBudgets ? ` (${summary.budgetTargets.length})` : ""}
          </h3>
          {hasBudgets ? (
            <ul className="flex flex-col gap-0.5 text-sm max-h-40 overflow-y-auto">
              {summary.budgetTargets.map((b) => (
                <li key={b.categoryName} className="flex items-center justify-between gap-2">
                  <span className="truncate">{b.categoryName}</span>
                  <span className="tabular-nums text-black/70 dark:text-white/70 shrink-0">
                    {b.targetAvgPrice.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/50 dark:text-white/50">No budget targets set.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Wish list</h3>
          {hasWishlist ? (
            <div className="flex flex-col gap-1.5 text-sm max-h-40 overflow-y-auto">
              {summary.mustHaves.length > 0 && (
                <p>
                  <Badge variant="info">Must-have ({summary.mustHaves.length})</Badge>{" "}
                  <span className="text-black/70 dark:text-white/70">
                    {summary.mustHaves.map((m) => m.playerName).join(", ")}
                  </span>
                </p>
              )}
              {summary.avoids.length > 0 && (
                <p>
                  <Badge variant="neutral">Avoid ({summary.avoids.length})</Badge>{" "}
                  <span className="text-black/70 dark:text-white/70">
                    {summary.avoids.map((a) => a.playerName).join(", ")}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-black/50 dark:text-white/50">No must-haves or avoids set.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
            Predictions{hasPredictions ? ` (${summary.predictions.length})` : ""}
          </h3>
          {hasPredictions ? (
            <ul className="flex flex-col gap-0.5 text-sm max-h-40 overflow-y-auto">
              {summary.predictions.map((p) => (
                <li key={p.playerId} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.playerName}</span>
                  <span className="text-black/70 dark:text-white/70 text-right shrink-0">
                    {describePrediction(p)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/50 dark:text-white/50">No predictions made.</p>
          )}
        </div>
      </div>
    </details>
  );
}

function Scorecard({ summary }: { summary: SimulationSummaryDisplay }) {
  const wishlistRows = [
    ...summary.mustHaves.map((m) => ({
      key: `must-${m.playerId}`,
      playerName: m.playerName,
      type: "Must-have" as const,
      fraction: m.wonRunCount / summary.runCount,
      variant: (m.wonRunCount === summary.runCount ? "success" : m.wonRunCount === 0 ? "danger" : "warning") as
        | "success"
        | "warning"
        | "danger",
      avgSpendWhenWon: m.avgSpendWhenWon,
    })),
    ...summary.avoids
      .filter((a) => a.wonBySelfRunCount > 0)
      .map((a) => ({
        key: `avoid-${a.playerId}`,
        playerName: a.playerName,
        type: "Avoid" as const,
        fraction: a.wonBySelfRunCount / summary.runCount,
        variant: "danger" as const,
        avgSpendWhenWon: null as number | null,
      })),
  ];

  return (
    <div className={`${card} p-4 flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Strategy scorecard</h2>
        <span className="text-xs text-black/50 dark:text-white/50">{summary.runCount} valid runs</span>
      </div>

      <p className="text-sm text-black/70 dark:text-white/70">
        Average budget left (savings): <span className="font-medium tabular-nums">{summary.budgetRemainingRange.avg.toFixed(0)}</span>
      </p>

      {summary.squadFrequencies.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Most likely squad</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={tableHead}>
                <th className="py-1.5 pr-4 font-medium">Player</th>
                <th className="py-1.5 font-medium">Likelihood</th>
              </tr>
            </thead>
            <tbody>
              {summary.squadFrequencies.map((f) => (
                <tr key={f.playerId} className={tableRow}>
                  <td className="py-1.5 pr-4">
                    {f.playerName} <span className="text-black/50 dark:text-white/50">({f.categoryName})</span>
                  </td>
                  <td className="py-1.5">
                    <LikelihoodBar fraction={f.frequency} variant={f.frequency >= 0.5 ? "success" : "warning"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.mostFrequentSquad.players.length > 0 && (
            <p className="text-xs text-black/50 dark:text-white/50">
              Best-matching combination ({summary.mostFrequentSquad.matchingRunCount}/
              {summary.mostFrequentSquad.sampleRunCount} runs &gt;60% overlap):{" "}
              {summary.mostFrequentSquad.players.map((p) => p.playerName).join(", ")}
            </p>
          )}
        </div>
      )}

      {wishlistRows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">Wishlist outcomes</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className={tableHead}>
                <th className="py-1.5 pr-4 font-medium">Player</th>
                <th className="py-1.5 pr-4 font-medium">Type</th>
                <th className="py-1.5 pr-4 font-medium">Result</th>
                <th className="py-1.5 font-medium text-right">Avg spend when won</th>
              </tr>
            </thead>
            <tbody>
              {wishlistRows.map((row) => (
                <tr key={row.key} className={tableRow}>
                  <td className="py-1.5 pr-4">{row.playerName}</td>
                  <td className="py-1.5 pr-4">
                    <Badge variant={row.type === "Must-have" ? "info" : "neutral"}>{row.type}</Badge>
                  </td>
                  <td className="py-1.5 pr-4">
                    <LikelihoodBar fraction={row.fraction} variant={row.variant} />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {row.avgSpendWhenWon != null ? Math.round(row.avgSpendWhenWon).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RunDetail({ run }: { run: SimulationRunDisplay }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-black/60 dark:text-white/60">
        {`${run.soldCount} player${run.soldCount === 1 ? "" : "s"} sold, ${run.unsoldCount} unsold in this run.`}
      </p>
      <RivalRostersPanel rosters={run.rosters} />
    </div>
  );
}

// Soft client-side hint only — the action itself (MAX_RUN_COUNT in
// auctionSimulation.actions.ts) is what actually enforces the bound.
const MAX_RUN_COUNT = 10000;
const DEFAULT_RUN_COUNT = 100;

export function SimulationPanel({
  teamAuctionEntryId,
  totalSlots,
  planSummary,
}: {
  teamAuctionEntryId: string;
  /** Your current full roster size, for the "Min squad size" input's
   * placeholder/ceiling. Optional — the input and validation still work
   * without it (falling back to whatever the server resolves), it just
   * can't show a specific placeholder or clamp client-side first. */
  totalSlots?: number;
  planSummary: SimulationPlanSummaryDisplay;
}) {
  const [runCount, setRunCount] = useState(DEFAULT_RUN_COUNT);
  // Empty string means "use the full squad" — not forced to a specific
  // number until the manager actually wants a lower bar.
  const [minSquadSizeInput, setMinSquadSizeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    runs: SimulationRunDisplay[];
    summary: SimulationSummaryDisplay;
    completeRunCount: number;
    totalRunCount: number;
    minSquadSize: number;
    shortfall: SimulationShortfallDisplay | null;
  } | null>(null);
  const [selectedRun, setSelectedRun] = useState(0);

  async function handleRun() {
    setLoading(true);
    setError(null);
    const minSquadSize = minSquadSizeInput.trim() === "" ? undefined : Number(minSquadSizeInput);
    const response = await runAuctionSimulationAction(teamAuctionEntryId, runCount, minSquadSize);
    setLoading(false);
    if (response.error) {
      setError(response.error);
      return;
    }
    setResult(response.data!);
    setSelectedRun(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <PlanSummary summary={planSummary} />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
          Runs
          <input
            type="number"
            min={1}
            max={MAX_RUN_COUNT}
            step={1}
            value={runCount}
            disabled={loading}
            onChange={(e) => {
              const parsed = Math.round(Number(e.target.value));
              if (Number.isFinite(parsed)) {
                setRunCount(Math.min(Math.max(parsed, 1), MAX_RUN_COUNT));
              }
            }}
            className={`${inputClass} w-20`}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-black/70 dark:text-white/70">
          Min squad size
          <input
            type="number"
            min={1}
            max={totalSlots}
            step={1}
            value={minSquadSizeInput}
            placeholder={totalSlots != null ? `${totalSlots} (full)` : "full"}
            disabled={loading}
            onChange={(e) => setMinSquadSizeInput(e.target.value)}
            className={`${inputClass} w-24`}
          />
        </label>
        <button type="button" disabled={loading} onClick={handleRun} className={buttonSecondary}>
          {loading ? "Simulating…" : result ? "Run again" : "Run simulation"}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {result && (
        <>
          <CompletionStatus
            completeRunCount={result.completeRunCount}
            totalRunCount={result.totalRunCount}
            minSquadSize={result.minSquadSize}
            totalSlots={totalSlots}
            shortfall={result.shortfall}
          />

          <Scorecard summary={result.summary} />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={tabsTrack}>
                {result.runs.map((run, i) => (
                  <button
                    key={run.seed}
                    type="button"
                    onClick={() => setSelectedRun(i)}
                    className={tabItem(selectedRun === i)}
                    title={run.complete ? "Roster filled" : "Roster did not fill"}
                  >
                    Run {i + 1}
                    {!run.complete && <span className="text-amber-600 dark:text-amber-400"> ⚠</span>}
                  </button>
                ))}
              </div>
              <span className="text-xs text-black/50 dark:text-white/50">
                {result.runs.length} of the {result.summary.runCount} simulated runs behind the scorecard above
              </span>
            </div>
            <RunDetail run={result.runs[selectedRun]} />
          </div>
        </>
      )}
    </div>
  );
}
