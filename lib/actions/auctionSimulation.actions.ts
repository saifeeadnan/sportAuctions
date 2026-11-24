"use server";

import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/errors";
import { toActionResult, type ActionResult } from "@/lib/actions/result";
import { loadAuctionAnalyticsSnapshot } from "@/lib/auction/analyticsAdapter";
import { computePlayerValueScores } from "@/lib/auction-analytics/playerValue";
import { computeRivalRosters } from "@/lib/auction-analytics/rivalRosters";
import { isRunComplete, simulateAuctionRuns } from "@/lib/auction-analytics/simulateAuction";
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
  rosters: RivalRosterDisplay[];
};

export type SimulationSummaryDisplay = {
  runCount: number;
  teamStrengthRange: { min: number; max: number; avg: number };
  budgetRemainingRange: { min: number; max: number; avg: number };
  selfRankRange: { min: number; max: number; avg: number };
  totalTeams: number;
  mustHaves: { playerId: string; playerName: string; wonRunCount: number; lostRunCount: number; unresolvedRunCount: number }[];
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
  runCount: number = DEFAULT_RUN_COUNT
): Promise<ActionResult<{ runs: SimulationRunDisplay[]; summary: SimulationSummaryDisplay }>> {
  return toActionResult(async () => {
    if (!Number.isInteger(runCount) || runCount < 1 || runCount > MAX_RUN_COUNT) {
      throw new ValidationError(`Number of runs must be a whole number between 1 and ${MAX_RUN_COUNT}`);
    }

    const entry = await requireOwnedAnalyticsEntry(teamAuctionEntryId);
    const snapshot = await loadAuctionAnalyticsSnapshot(entry.auctionId, entry.id); // FRESH fetch — current live state
    if (!snapshot) throw new ValidationError("Auction not found");

    const teamNameById = new Map(snapshot.teams.map((t) => [t.id, t.name]));
    const categoryNameById = new Map(snapshot.categories.map((c) => [c.id, c.name]));
    const playerNameById = new Map(snapshot.players.map((p) => [p.id, p.name]));
    const categoryNameByPlayerId = new Map(
      snapshot.players.map((p) => [p.id, categoryNameById.get(p.categoryId) ?? p.categoryId])
    );

    const valueScores = computePlayerValueScores(snapshot.players);
    const allRuns = simulateAuctionRuns(snapshot, runCount);
    // A run that leaves the manager's OWN team short of its roster size isn't
    // a realistic completed outcome for them (the remaining pool ran dry, or
    // ran out of anyone able to legally afford a lot, before every one of
    // their slots was filled) — excluded here, upstream of both the
    // scorecard and the run switcher, so neither ever counts it as valid. A
    // rival finishing short doesn't disqualify a run on its own.
    const runs = allRuns.filter((run) => isRunComplete(snapshot, run));
    if (runs.length === 0) {
      throw new ValidationError(
        "None of the simulated runs finished with your own roster filled — try running again."
      );
    }
    const summary = computeSimulationAggregateSummary(snapshot, runs, valueScores);

    // Only the first DISPLAY_RUN_COUNT of the valid runs are materialized
    // into full roster displays for the run switcher — the rest are
    // summarized above but never individually shown.
    const runDisplays: SimulationRunDisplay[] = runs.slice(0, Math.min(DISPLAY_RUN_COUNT, runs.length)).map((run) => {
      const { adjustedTeams, combinedSales } = mergeRunIntoSnapshot(snapshot, run);
      const rosters = computeRivalRosters(adjustedTeams, snapshot.players, combinedSales, valueScores);

      const rosterDisplays: RivalRosterDisplay[] = rosters
        .map((r) => ({
          teamId: r.teamId,
          teamName: teamNameById.get(r.teamId) ?? r.teamId,
          isSelf: r.teamId === snapshot.selfTeamId,
          budgetRemaining: r.budgetRemaining,
          teamStrength: r.teamStrength,
          players: r.entries.map((e) => ({
            playerId: e.playerId,
            playerName: playerNameById.get(e.playerId) ?? e.playerId,
            categoryName: categoryNameById.get(e.categoryId) ?? e.categoryId,
            price: e.price,
            valueScore: e.valueScore,
          })),
        }))
        .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

      return { seed: run.seed, rosters: rosterDisplays };
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

    return { runs: runDisplays, summary: summaryDisplay };
  });
}
