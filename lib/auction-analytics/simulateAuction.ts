import { mulberry32 } from "@/lib/random";
import {
  legalMaxBidEnforced,
  resolveContestedLot,
  resolvePredictedLot,
  reserveUnit,
  type SimulatedLot,
  type TeamRunState,
} from "./simulateLot";
import type { AnalyticsCategory, AnalyticsPlayer, AuctionAnalyticsSnapshot, SaleEvent } from "./types";

export type SimulationRun = { seed: number; lots: SimulatedLot[] };

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Highest base-price category fully exhausted before the next one, random
 * order within a category — the same priority order the live auctioneer's
 * own "random pick" flow already uses (pickFromHighestCategory,
 * components/auctioneer/AuctioneerConsole.tsx). Without this, a flat shuffle
 * across every category lets teams fill up on cheap/abundant categories
 * before an expensive, scarce one (e.g. "Anchor") ever gets a well-funded,
 * slots-still-open shot at every team.
 */
function orderPoolByCategoryPriority(
  players: AnalyticsPlayer[],
  categories: AnalyticsCategory[],
  rng: () => number
): AnalyticsPlayer[] {
  const basePriceByCategoryId = new Map(categories.map((c) => [c.id, c.basePrice]));
  const presentCategoryIds = Array.from(new Set(players.map((p) => p.categoryId))).sort(
    (a, b) => (basePriceByCategoryId.get(b) ?? 0) - (basePriceByCategoryId.get(a) ?? 0)
  );
  return presentCategoryIds.flatMap((categoryId) =>
    shuffleWithRng(players.filter((p) => p.categoryId === categoryId), rng)
  );
}

// Other must-have picks still in play in the same category, not counting
// this one — mirrors the live equivalent (components/manager/LiveBidGuidancePanel.tsx).
function countOtherMustHavesRemaining(
  player: AnalyticsPlayer,
  mustHaveIds: ReadonlySet<string>,
  players: AnalyticsPlayer[],
  salesSoFar: SaleEvent[]
): number {
  const soldIds = new Set(salesSoFar.map((s) => s.playerId));
  return players.filter(
    (p) => p.id !== player.id && p.categoryId === player.categoryId && mustHaveIds.has(p.id) && !soldIds.has(p.id)
  ).length;
}

// Any team's cumulative spend in this category so far this run — feeds both
// self's budget-target gate and, for rivals, the manager's own "My
// estimates" (RivalCategoryEstimateInput) gate below.
function teamSpentInCategory(
  teamId: string,
  categoryId: string,
  players: AnalyticsPlayer[],
  salesSoFar: SaleEvent[]
): number {
  const categoryPlayerIds = new Set(players.filter((p) => p.categoryId === categoryId).map((p) => p.id));
  return salesSoFar
    .filter((s) => s.teamId === teamId && categoryPlayerIds.has(s.playerId))
    .reduce((sum, s) => sum + s.price, 0);
}

// Rival teams the manager has estimated a category budget for, that have
// already spent at or beyond that estimate in this category this run — the
// same "stop bidding here once the set budget is reached" gate self's own
// budget target gets, applied to the manager's own belief about a rival
// instead. Previously "My estimates" was display-only and never actually
// shaped how a rival was simulated to bid.
function rivalsOverEstimatedCategoryBudget(
  teams: { id: string }[],
  selfTeamId: string,
  categoryId: string,
  rivalEstimateByTeamCategory: ReadonlyMap<string, number>,
  players: AnalyticsPlayer[],
  salesSoFar: SaleEvent[]
): ReadonlySet<string> {
  const over = new Set<string>();
  for (const team of teams) {
    if (team.id === selfTeamId) continue;
    const cap = rivalEstimateByTeamCategory.get(`${team.id}:${categoryId}`);
    if (cap == null) continue;
    if (teamSpentInCategory(team.id, categoryId, players, salesSoFar) >= cap) over.add(team.id);
  }
  return over;
}

/**
 * One full randomized rollout of the rest of this auction, from its current
 * live state through to every remaining player resolved. Remaining = every
 * player not already in `snapshot.sales` — a player marked UNSOLD is still
 * eligible, matching the live queue's own treatment (it can come back up).
 */
export function simulateAuctionRun(snapshot: AuctionAnalyticsSnapshot, seed: number): SimulationRun {
  const { teams, categories, players, sales, selfTeamId, wishlist, budgetTargets, predictions, rivalEstimates } = snapshot;

  const soldPlayerIds = new Set(sales.map((s) => s.playerId));
  const remainingPlayers = players.filter((p) => !soldPlayerIds.has(p.id));

  const unit = reserveUnit(categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const predictionByPlayerId = new Map(predictions.map((p) => [p.playerId, p]));
  const mustHaveIds = new Set(wishlist.filter((w) => w.type === "MUST_HAVE").map((w) => w.playerId));
  const avoidIds = new Set(wishlist.filter((w) => w.type === "AVOID").map((w) => w.playerId));
  const budgetTargetByCategoryId = new Map(budgetTargets.map((t) => [t.categoryId, t.targetAvgPrice]));
  const rivalEstimateByTeamCategory = new Map(
    rivalEstimates.map((e) => [`${e.targetTeamId}:${e.categoryId}`, e.estimatedBudget])
  );

  const teamState = new Map<string, TeamRunState>();
  for (const team of teams) {
    const teamSalesCount = sales.filter((s) => s.teamId === team.id).length;
    teamState.set(team.id, {
      budgetRemaining: team.budgetRemaining,
      slotsRemaining: team.totalSlots - teamSalesCount,
    });
  }

  const rng = mulberry32(seed);
  const shuffledPlayers = orderPoolByCategoryPriority(remainingPlayers, categories, rng);

  const salesSoFar: SaleEvent[] = [...sales];
  const lots: SimulatedLot[] = [];

  for (let i = 0; i < shuffledPlayers.length; i++) {
    const player = shuffledPlayers[i];
    const category = categoryById.get(player.categoryId);
    if (!category) continue; // defensive: an unmatched category name/id, see analyticsAdapter.ts's own fallback

    const prediction = predictionByPlayerId.get(player.id);
    // A prediction is honored only while it's still legally possible — once
    // the predicted winner's reserve-respecting legal room has shrunk below
    // this player's base price (from its own earlier picks this run), the
    // real server would never have let them win it anyway, so the lot falls
    // back to ordinary competitive resolution instead of forcing a sale that
    // would push their budget below what their remaining slots need.
    const predictedWinnerStillLegal =
      prediction != null &&
      prediction.predictedWinnerTeamId != null &&
      legalMaxBidEnforced(teamState.get(prediction.predictedWinnerTeamId)!, unit) >= player.basePrice;
    const lot = predictedWinnerStillLegal
      ? resolvePredictedLot({
          player,
          category,
          prediction: { ...prediction!, predictedWinnerTeamId: prediction!.predictedWinnerTeamId! },
          teamState,
          unit,
          players,
          salesSoFar,
        })
      : resolveContestedLot({
          player,
          category,
          teams,
          selfTeamId,
          teamState,
          unit,
          mustHaveIds,
          avoidIds,
          budgetTargetByCategoryId,
          selfCategorySpentSoFar: teamSpentInCategory(selfTeamId, player.categoryId, players, salesSoFar),
          teamsOverEstimatedCategoryBudget: rivalsOverEstimatedCategoryBudget(
            teams,
            selfTeamId,
            player.categoryId,
            rivalEstimateByTeamCategory,
            players,
            salesSoFar
          ),
          // The manager's own predicted price for this player still applies
          // as a ceiling even once it's reached here — either it was a
          // price-only prediction (no team to deterministically honor), or
          // its predicted winner ran out of legal room above; either way,
          // the manager's belief about the price stands.
          priceCeiling: prediction?.predictedAmount ?? null,
          // Symmetric floor from the same prediction's low end, if one was
          // given.
          priceFloor: prediction?.predictedMinAmount ?? null,
          otherMustHavesRemainingInCategory: countOtherMustHavesRemaining(player, mustHaveIds, remainingPlayers, salesSoFar),
          remainingLotsAfterThis: shuffledPlayers.length - i - 1,
          remainingPoolBasePricesForSelf: remainingPlayers
            .filter((p) => p.id !== player.id && !salesSoFar.some((s) => s.playerId === p.id))
            .map((p) => p.basePrice),
          players,
          salesSoFar,
          rng,
        });

    lots.push(lot);
    if (!("unsold" in lot)) {
      salesSoFar.push({ playerId: lot.playerId, teamId: lot.teamId, price: lot.price, timestamp: "" });
      const state = teamState.get(lot.teamId)!;
      teamState.set(lot.teamId, {
        budgetRemaining: state.budgetRemaining - lot.price,
        slotsRemaining: state.slotsRemaining - 1,
      });
    }
  }

  return { seed, lots };
}

/**
 * A run only represents a realistic completed outcome for the manager if
 * *their own* team ended up with exactly as many players as its own roster
 * size (totalSlots) calls for. Only self's squad is checked — a rival
 * finishing a player short (it ran out of legal budget room, or the
 * remaining pool ran dry before it could afford one more) doesn't make the
 * manager's own result any less realistic, so it doesn't invalidate the run.
 * If self's own squad falls short, though, that's excluded from the
 * scorecard/display rather than silently counted alongside genuinely
 * complete ones and skewing the averages.
 */
export function isRunComplete(snapshot: AuctionAnalyticsSnapshot, run: SimulationRun): boolean {
  const selfTeam = snapshot.teams.find((t) => t.id === snapshot.selfTeamId);
  if (!selfTeam) return false;
  return selfSquadPlayerIds(snapshot, run).length === selfTeam.totalSlots;
}

/** The player ids on self's final roster for one run: snapshot.sales (already
 * won, pre-simulation) plus this run's own wins by self. Used to build the
 * "most likely squad" summaries in simulationSummary.ts — per-player
 * frequency and the most frequently recurring squad combination. */
export function selfSquadPlayerIds(snapshot: AuctionAnalyticsSnapshot, run: SimulationRun): string[] {
  const ids = snapshot.sales.filter((s) => s.teamId === snapshot.selfTeamId).map((s) => s.playerId);
  for (const lot of run.lots) {
    if (!("unsold" in lot) && lot.teamId === snapshot.selfTeamId) ids.push(lot.playerId);
  }
  return ids;
}

/** `runCount` independent rollouts, each with its own deterministic seed
 * derived from `rootSeed` (defaults to "now," so a fresh click reshuffles). */
export function simulateAuctionRuns(
  snapshot: AuctionAnalyticsSnapshot,
  runCount = 5,
  rootSeed = Date.now()
): SimulationRun[] {
  return Array.from({ length: runCount }, (_, i) => simulateAuctionRun(snapshot, (rootSeed + i * 0x9e3779b9) | 0));
}
