"use server";

import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { loadAuctionAnalyticsSnapshot } from "@/lib/auction/analyticsAdapter";
import { computePlayerValueScores } from "@/lib/auction-analytics/playerValue";
import { computeRivalRosters } from "@/lib/auction-analytics/rivalRosters";
import { diagnoseRunShortfall, isRunComplete, simulateAuctionRuns, type RunShortfall } from "@/lib/auction-analytics/simulateAuction";
import { computeSimulationAggregateSummary, mergeRunIntoSnapshot } from "@/lib/auction-analytics/simulationSummary";
import type { RivalRosterDisplay } from "@/components/manager/RivalRostersPanel";

const DEFAULT_RUN_COUNT = 100; // feeds the aggregate scorecard — cheap, pure in-memory, no Prisma calls
const MAX_RUN_COUNT = 10000; // generous cap — still trivial, pure in-memory arithmetic at this scale
const DISPLAY_RUN_COUNT = 5; // first N of the requested runs are additionally materialized for the run-switcher

async function requireOwnedAnalyticsEntry(teamAuctionEntryId: string) {
  const session = await requireRole("TEAM_MANAGER");

  const entry = await prisma.teamAuctionEntry.findUnique({
    where: { id: teamAuctionEntryId },
    include: { team: true },
  });
  if (!entry || entry.team.managerId !== session.user.id) {
    throw new ValidationError("You do not manage this team");
  }
  if (!entry.analyticsEnabled) {
    throw new ValidationError("The analytics dashboard is not enabled for this team");
  }
  return entry;
}

export type SimulationRunDisplay = {
  seed: number;
  complete: boolean;
  soldCount: number;
  unsoldCount: number;
  rosters: RivalRosterDisplay[];
};

export type SimulationShortfallDisplay = {
  incompleteRunCount: number;
  ranOutOfLegalBudgetRunCount: number;
  avgSlotsStillNeeded: number;
  avgEligibleLotsLostToRivals: number;
  avgLotsWentUnsoldWhileEligible: number;
};

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

export type SimulationSummaryDisplay = {
  runCount: number;
  teamStrengthRange: { min: number; max: number; avg: number };
  budgetRemainingRange: { min: number; max: number; avg: number };
  selfRankRange: { min: number; max: number; avg: number };
  totalTeams: number;
  mustHaves: {
    playerId: string;
    playerName: string;
    wonRunCount: number;
    lostRunCount: number;
    unresolvedRunCount: number;
    avgSpendWhenWon: number | null;
  }[];
  avoids: { playerId: string; playerName: string; wonBySelfRunCount: number; avoidedRunCount: number; unresolvedRunCount: number }[];
  squadFrequencies: { playerId: string; playerName: string; categoryName: string; runCount: number; frequency: number }[];
  mostFrequentSquad: {
    players: { playerId: string; playerName: string; categoryName: string }[];
    matchingRunCount: number;
    sampleRunCount: number;
  };
};

// No revalidatePath — nothing is persisted, this is a compute-and-show
// preview. The panel holds its own local result state, same precedent as
// savePredictionAction's documented reasoning.

export async function runAuctionSimulationAction(
  teamAuctionEntryId: string,
  runCount: number = DEFAULT_RUN_COUNT,
  // Lowers the "did this run actually succeed" bar below a fully-filled
  // roster — some real auctions only require a minimum squad, not every
  // slot taken. Validated against the team's own totalSlots once the
  // snapshot loads below; undefined (the default) keeps today's original,
  // stricter "every slot filled" behavior.
  minSquadSize?: number
): Promise<
  ActionResult<{
    runs: SimulationRunDisplay[];
    summary: SimulationSummaryDisplay;
    completeRunCount: number;
    totalRunCount: number;
    minSquadSize: number;
    shortfall: SimulationShortfallDisplay | null;
  }>
> {
  return toActionResult(async () => {
    if (!Number.isInteger(runCount) || runCount < 1 || runCount > MAX_RUN_COUNT) {
      throw new ValidationError(`Number of runs must be a whole number between 1 and ${MAX_RUN_COUNT}`);
    }

    const entry = await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    const snapshot = await loadAuctionAnalyticsSnapshot(entry.auctionId, entry.id); // FRESH fetch — current live state
    if (!snapshot) throw new ValidationError("Auction not found");

    const selfTeam = snapshot.teams.find((t) => t.id === snapshot.selfTeamId);
    if (!selfTeam) throw new ValidationError("Your team was not found in this auction's snapshot");
    if (minSquadSize != null && (!Number.isInteger(minSquadSize) || minSquadSize < 1 || minSquadSize > selfTeam.totalSlots)) {
      throw new ValidationError(`Minimum squad size must be a whole number between 1 and ${selfTeam.totalSlots}`);
    }
    const effectiveMinSquadSize = minSquadSize ?? selfTeam.totalSlots;

    const teamNameById = new Map(snapshot.teams.map((t) => [t.id, t.name]));
    const categoryNameById = new Map(snapshot.categories.map((c) => [c.id, c.name]));
    const playerNameById = new Map(snapshot.players.map((p) => [p.id, p.name]));
    const categoryNameByPlayerId = new Map(
      snapshot.players.map((p) => [p.id, categoryNameById.get(p.categoryId) ?? p.categoryId])
    );

    const valueScores = computePlayerValueScores(snapshot.players);
    const allRuns = simulateAuctionRuns(snapshot, runCount);
    // A run that leaves the manager's OWN team short of its minimum squad
    // size isn't a realistic completed outcome for them (the remaining pool
    // ran dry, or ran out of anyone able to legally afford a lot, before
    // enough of their slots were filled). A rival finishing short doesn't
    // disqualify a run on its own. These are preferred for the scorecard/
    // run switcher whenever any exist, but no longer required outright —
    // the manager sees the status (how many completed, and why the rest
    // didn't) either way, instead of an opaque "try again."
    const completeRuns = allRuns.filter((run) => isRunComplete(snapshot, run, effectiveMinSquadSize));
    const incompleteRuns = allRuns.filter((run) => !isRunComplete(snapshot, run, effectiveMinSquadSize));
    const runsForDisplay = completeRuns.length > 0 ? completeRuns : allRuns;

    const shortfallDiagnoses = incompleteRuns
      .map((run) => diagnoseRunShortfall(snapshot, run, effectiveMinSquadSize))
      .filter((d): d is RunShortfall => d != null);
    const shortfall: SimulationShortfallDisplay | null =
      incompleteRuns.length > 0
        ? {
            incompleteRunCount: incompleteRuns.length,
            ranOutOfLegalBudgetRunCount: shortfallDiagnoses.filter((d) => d.ranOutOfLegalBudget).length,
            avgSlotsStillNeeded: average(shortfallDiagnoses.map((d) => d.slotsStillNeeded)),
            avgEligibleLotsLostToRivals: average(shortfallDiagnoses.map((d) => d.eligibleLotsLostToRivals)),
            avgLotsWentUnsoldWhileEligible: average(shortfallDiagnoses.map((d) => d.lotsWentUnsoldWhileEligible)),
          }
        : null;

    const summary = computeSimulationAggregateSummary(snapshot, runsForDisplay, valueScores);

    // Only the first DISPLAY_RUN_COUNT of runsForDisplay are materialized
    // into full roster displays for the run switcher — the rest are
    // summarized above but never individually shown.
    // Players every team already had BEFORE this simulation (retained/
    // traded, pre-auction) — excluded from the per-run roster display below
    // so it shows what the RUN itself decided, not the starting squads the
    // manager can already see in full on the All Rosters tab.
    const preExistingPlayerIds = new Set(snapshot.sales.map((s) => s.playerId));

    const runDisplays: SimulationRunDisplay[] = runsForDisplay
      .slice(0, Math.min(DISPLAY_RUN_COUNT, runsForDisplay.length))
      .map((run) => {
      // Every lot in a run is exactly one player from the remaining pool,
      // resolved either way — no double-counting and nothing left over.
      const unsoldCount = run.lots.filter((l) => "unsold" in l).length;
      const soldCount = run.lots.length - unsoldCount;

      const { adjustedTeams, combinedSales } = mergeRunIntoSnapshot(snapshot, run);
      const rosters = computeRivalRosters(adjustedTeams, snapshot.players, combinedSales, valueScores);
      const totalSlotsByTeamId = new Map(adjustedTeams.map((t) => [t.id, t.totalSlots]));

      const rosterDisplays: RivalRosterDisplay[] = rosters
        .map((r) => ({
          teamId: r.teamId,
          teamName: teamNameById.get(r.teamId) ?? r.teamId,
          isSelf: r.teamId === snapshot.selfTeamId,
          budgetRemaining: r.budgetRemaining,
          teamStrength: r.teamStrength,
          // r.entries.length BEFORE the pre-existing filter below — the
          // team's real slot count, not just how many rows this run's
          // trimmed-down player list happens to show.
          slotsFilled: r.entries.length,
          slotsTotal: totalSlotsByTeamId.get(r.teamId) ?? r.entries.length,
          players: r.entries
            .filter((e) => !preExistingPlayerIds.has(e.playerId))
            .map((e) => ({
              playerId: e.playerId,
              playerName: playerNameById.get(e.playerId) ?? e.playerId,
              categoryName: categoryNameById.get(e.categoryId) ?? e.categoryId,
              price: e.price,
              valueScore: e.valueScore,
            })),
        }))
        .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

      return {
        seed: run.seed,
        complete: isRunComplete(snapshot, run, effectiveMinSquadSize),
        soldCount,
        unsoldCount,
        rosters: rosterDisplays,
      };
    });

    const summaryDisplay: SimulationSummaryDisplay = {
      runCount: summary.runCount,
      teamStrengthRange: summary.teamStrengthRange,
      budgetRemainingRange: summary.budgetRemainingRange,
      selfRankRange: summary.selfRankRange,
      totalTeams: summary.totalTeams,
      mustHaves: summary.mustHaves.map((m) => ({ ...m, playerName: playerNameById.get(m.playerId) ?? m.playerId })),
      avoids: summary.avoids.map((a) => ({ ...a, playerName: playerNameById.get(a.playerId) ?? a.playerId })),
      squadFrequencies: summary.squadFrequencies.map((f) => ({
        ...f,
        playerName: playerNameById.get(f.playerId) ?? f.playerId,
        categoryName: categoryNameByPlayerId.get(f.playerId) ?? "",
      })),
      mostFrequentSquad: {
        matchingRunCount: summary.mostFrequentSquad.matchingRunCount,
        sampleRunCount: summary.mostFrequentSquad.sampleRunCount,
        players: summary.mostFrequentSquad.playerIds.map((playerId) => ({
          playerId,
          playerName: playerNameById.get(playerId) ?? playerId,
          categoryName: categoryNameByPlayerId.get(playerId) ?? "",
        })),
      },
    };

    return {
      runs: runDisplays,
      summary: summaryDisplay,
      completeRunCount: completeRuns.length,
      totalRunCount: allRuns.length,
      minSquadSize: effectiveMinSquadSize,
      shortfall,
    };
  });
}
