import { computeRivalRosters } from "./rivalRosters";
import { computeWishlistFeasibility } from "./wishlistFeasibility";
import type { SimulatedLot } from "./simulateLot";
import { selfSquadPlayerIds, type SimulationRun } from "./simulateAuction";
import type { AnalyticsTeam, AuctionAnalyticsSnapshot, PlayerValueScore, SaleEvent } from "./types";

// Caps the most-frequent-squad clustering below to a representative sample
// rather than every requested run — it's an O(n^2) pairwise comparison, and
// a manager can ask for up to MAX_RUN_COUNT (lib/actions/auctionSimulation.
// actions.ts) runs, where comparing all of them would get expensive for no
// real gain in the answer's accuracy.
const MATCHING_SQUAD_SAMPLE_SIZE = 1000;
// Strictly greater than, not >= — a squad must share a clear majority of
// the reference squad's players, not just exactly half.
const MATCHING_SQUAD_OVERLAP_THRESHOLD = 0.6;

export type SimulationMustHaveAggregate = {
  playerId: string;
  wonRunCount: number;
  lostRunCount: number;
  unresolvedRunCount: number;
  /** Average price self actually paid, across only the runs where this
   * must-have was won by self — null when it was never won in any run
   * (nothing to average). */
  avgSpendWhenWon: number | null;
};

/** The AVOID-list mirror of SimulationMustHaveAggregate — computeWishlistFeasibility
 * deliberately ignores AVOID entries, so this is new, parallel logic: did the
 * manager's own strategy actually keep them away from this player? */
export type SimulationAvoidAggregate = {
  playerId: string;
  wonBySelfRunCount: number;
  avoidedRunCount: number;
  unresolvedRunCount: number;
};

/** How often one specific player ended up on self's roster, across every
 * valid run — self's own "most likely squad," one row per player, not
 * limited to wishlist entries. */
export type SquadFrequencyEntry = { playerId: string; runCount: number; frequency: number };

/** The single squad combination (an actual roster some run produced) that
 * the most OTHER sampled runs overlap with by more than
 * MATCHING_SQUAD_OVERLAP_THRESHOLD of its size — i.e. which specific
 * outcome most often recurs as substantially "the same set of people,"
 * rather than just each player's own individual frequency
 * (SquadFrequencyEntry). */
export type MostFrequentSquad = { playerIds: string[]; matchingRunCount: number; sampleRunCount: number };

export type SimulationAggregateSummary = {
  runCount: number;
  teamStrengthRange: { min: number; max: number; avg: number };
  budgetRemainingRange: { min: number; max: number; avg: number };
  /** This team's rank by teamStrength among all teams, 1 = strongest, ties
   * share a rank (same convention as the Pickleball standings ranker
   * elsewhere in this app) — computed per run, then summarized. */
  selfRankRange: { min: number; max: number; avg: number };
  totalTeams: number;
  mustHaves: SimulationMustHaveAggregate[];
  avoids: SimulationAvoidAggregate[];
  squadFrequencies: SquadFrequencyEntry[];
  mostFrequentSquad: MostFrequentSquad;
};

type WonLot = Exclude<SimulatedLot, { unsold: true }>;

function isWonLot(lot: SimulatedLot): lot is WonLot {
  return !("unsold" in lot);
}

function range(values: number[]): { min: number; max: number; avg: number } {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, v) => sum + v, 0) / values.length,
  };
}

/** Excel-RANK()-style: teams tied on teamStrength share a rank, the next
 * distinct value skips ahead — same convention lib/pickleball/standings.ts's
 * own ranker uses elsewhere in this app. */
export function rankByTeamStrength(rosters: { teamId: string; teamStrength: number }[], selfTeamId: string): number {
  const sorted = [...rosters].sort((a, b) => b.teamStrength - a.teamStrength);
  let rank = 0;
  let seen = 0;
  let prevStrength: number | null = null;
  for (const r of sorted) {
    seen += 1;
    if (prevStrength === null || r.teamStrength !== prevStrength) {
      rank = seen;
      prevStrength = r.teamStrength;
    }
    if (r.teamId === selfTeamId) return rank;
  }
  return sorted.length;
}

function squadOverlapFraction(candidate: string[], reference: ReadonlySet<string>): number {
  if (candidate.length === 0) return 0;
  let shared = 0;
  for (const id of candidate) if (reference.has(id)) shared += 1;
  return shared / candidate.length;
}

/** Tries each sampled run's own squad as a candidate "the most likely
 * squad," counts how many other sampled runs overlap with it by more than
 * MATCHING_SQUAD_OVERLAP_THRESHOLD, and returns whichever candidate
 * collects the most matches. */
function computeMostFrequentSquad(squadIdsByRun: string[][]): MostFrequentSquad {
  const sample = squadIdsByRun.slice(0, MATCHING_SQUAD_SAMPLE_SIZE);
  const sampleAsSets = sample.map((ids) => new Set(ids));

  let bestIndex = 0;
  let bestMatchCount = 0;
  for (let i = 0; i < sample.length; i++) {
    let matchCount = 0;
    for (const otherSquad of sample) {
      if (squadOverlapFraction(otherSquad, sampleAsSets[i]) > MATCHING_SQUAD_OVERLAP_THRESHOLD) matchCount += 1;
    }
    if (matchCount > bestMatchCount) {
      bestIndex = i;
      bestMatchCount = matchCount;
    }
  }

  return {
    playerIds: sample.length > 0 ? sample[bestIndex] : [],
    matchingRunCount: bestMatchCount,
    sampleRunCount: sample.length,
  };
}

export type MergedRunSales = { adjustedTeams: AnalyticsTeam[]; combinedSales: SaleEvent[] };

/** One run's winners merged onto the snapshot's real sales, with each team's
 * simulated-only spend pre-subtracted from its budgetRemaining —
 * computeRivalRosters/computeWishlistFeasibility pass budgetRemaining
 * straight through unchanged, so skipping this would show today's real
 * remaining budget instead of the post-simulation figure. Shared by the
 * aggregate summary below and by the server action's per-run display
 * materialization, so the two never compute this differently. */
export function mergeRunIntoSnapshot(snapshot: AuctionAnalyticsSnapshot, run: SimulationRun): MergedRunSales {
  const wonLots = run.lots.filter(isWonLot);
  const combinedSales: SaleEvent[] = [
    ...snapshot.sales,
    ...wonLots.map((lot) => ({ playerId: lot.playerId, teamId: lot.teamId, price: lot.price, timestamp: "" })),
  ];

  const simulatedSpendByTeamId = new Map<string, number>();
  for (const lot of wonLots) {
    simulatedSpendByTeamId.set(lot.teamId, (simulatedSpendByTeamId.get(lot.teamId) ?? 0) + lot.price);
  }
  const adjustedTeams = snapshot.teams.map((t) => ({
    ...t,
    budgetRemaining: t.budgetRemaining - (simulatedSpendByTeamId.get(t.id) ?? 0),
  }));

  return { adjustedTeams, combinedSales };
}

/**
 * Condenses a batch of simulation runs into one "how did my strategy do"
 * scorecard: per run, merges the snapshot's real sales with that run's
 * simulated ones and pre-subtracts each team's simulated-only spend from its
 * budgetRemaining (computeRivalRosters passes budgetRemaining straight
 * through unchanged, so skipping this would show today's real remaining
 * budget instead of the post-simulation figure) before reusing
 * computeRivalRosters/computeWishlistFeasibility exactly as the live
 * dashboard does.
 */
export function computeSimulationAggregateSummary(
  snapshot: AuctionAnalyticsSnapshot,
  runs: SimulationRun[],
  valueScores: PlayerValueScore[]
): SimulationAggregateSummary {
  const { teams, players, selfTeamId, wishlist, sales } = snapshot;
  const mustHaves = wishlist.filter((w) => w.type === "MUST_HAVE");
  const avoids = wishlist.filter((w) => w.type === "AVOID");
  // Already on self's roster before this simulation (retained/traded) —
  // excluded from the "most likely squad" breakdown below, which is about
  // what the RUN itself decided, not facts the manager already knows (and
  // which would otherwise sit at a deterministic 100% frequency, crowding
  // out the actually-variable picks once sliced to totalSlots rows).
  const preExistingSelfPlayerIds = new Set(sales.filter((s) => s.teamId === selfTeamId).map((s) => s.playerId));

  const selfTeamStrengths: number[] = [];
  const selfBudgetsRemaining: number[] = [];
  const selfRanks: number[] = [];
  const mustHaveTally = new Map(mustHaves.map((w) => [w.playerId, { won: 0, lost: 0, unresolved: 0, spendSum: 0 }]));
  const avoidTally = new Map(avoids.map((w) => [w.playerId, { wonBySelf: 0, avoided: 0, unresolved: 0 }]));
  const squadIdsByRun: string[][] = [];

  for (const run of runs) {
    squadIdsByRun.push(selfSquadPlayerIds(snapshot, run).filter((id) => !preExistingSelfPlayerIds.has(id)));

    const { adjustedTeams, combinedSales } = mergeRunIntoSnapshot(snapshot, run);
    const rosters = computeRivalRosters(adjustedTeams, players, combinedSales, valueScores);
    const selfRoster = rosters.find((r) => r.teamId === selfTeamId);
    if (selfRoster) {
      selfTeamStrengths.push(selfRoster.teamStrength);
      selfBudgetsRemaining.push(selfRoster.budgetRemaining);
    }
    selfRanks.push(rankByTeamStrength(rosters, selfTeamId));

    const selfTeam = adjustedTeams.find((t) => t.id === selfTeamId);
    if (selfTeam) {
      const wishlistSummary = computeWishlistFeasibility(selfTeam, players, combinedSales, wishlist, valueScores);
      for (const item of wishlistSummary.items) {
        const tally = mustHaveTally.get(item.playerId)!;
        if (item.status === "WON") {
          tally.won += 1;
          // computeWishlistFeasibility deliberately nulls out estimatedPrice
          // once a wishlist player is resolved, so the real price this run
          // actually paid comes straight from this run's own sales instead.
          const sale = combinedSales.find((s) => s.playerId === item.playerId && s.teamId === selfTeamId);
          tally.spendSum += sale?.price ?? 0;
        } else if (item.status === "LOST") tally.lost += 1;
        else tally.unresolved += 1;
      }
    }

    for (const w of avoids) {
      const tally = avoidTally.get(w.playerId)!;
      const winner = rosters.find((r) => r.entries.some((e) => e.playerId === w.playerId));
      if (!winner) tally.unresolved += 1;
      else if (winner.teamId === selfTeamId) tally.wonBySelf += 1;
      else tally.avoided += 1;
    }
  }

  const selfTotalSlots = teams.find((t) => t.id === selfTeamId)?.totalSlots ?? 0;
  // Open slots only, now that pre-existing players are excluded above —
  // there's no reason to show more rows than self actually has left to
  // fill with new picks.
  const selfOpenSlots = Math.max(selfTotalSlots - preExistingSelfPlayerIds.size, 0);
  const runCountByPlayerId = new Map<string, number>();
  for (const squadIds of squadIdsByRun) {
    for (const playerId of squadIds) {
      runCountByPlayerId.set(playerId, (runCountByPlayerId.get(playerId) ?? 0) + 1);
    }
  }
  const squadFrequencies: SquadFrequencyEntry[] = Array.from(runCountByPlayerId.entries())
    .map(([playerId, runCount]) => ({ playerId, runCount, frequency: runCount / runs.length }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, selfOpenSlots);

  return {
    runCount: runs.length,
    teamStrengthRange: range(selfTeamStrengths),
    budgetRemainingRange: range(selfBudgetsRemaining),
    selfRankRange: range(selfRanks),
    totalTeams: teams.length,
    mustHaves: mustHaves.map((w) => {
      const t = mustHaveTally.get(w.playerId)!;
      return {
        playerId: w.playerId,
        wonRunCount: t.won,
        lostRunCount: t.lost,
        unresolvedRunCount: t.unresolved,
        avgSpendWhenWon: t.won > 0 ? t.spendSum / t.won : null,
      };
    }),
    avoids: avoids.map((w) => {
      const t = avoidTally.get(w.playerId)!;
      return {
        playerId: w.playerId,
        wonBySelfRunCount: t.wonBySelf,
        avoidedRunCount: t.avoided,
        unresolvedRunCount: t.unresolved,
      };
    }),
    squadFrequencies,
    mostFrequentSquad: computeMostFrequentSquad(squadIdsByRun),
  };
}
