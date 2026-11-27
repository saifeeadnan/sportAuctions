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
//
// The estimate is forward-looking only (how much MORE a rival spends from
// here, never counting what they'd already spent/retained in this category
// before the simulation even started), so the cap is checked against spend
// accrued DURING this run — salesSoFar minus the original, pre-simulation
// `sales` baseline — not against salesSoFar's cumulative-ever total.
function rivalsOverEstimatedCategoryBudget(
  teams: { id: string }[],
  selfTeamId: string,
  categoryId: string,
  rivalEstimateByTeamCategory: ReadonlyMap<string, number>,
  players: AnalyticsPlayer[],
  sales: SaleEvent[],
  salesSoFar: SaleEvent[]
): ReadonlySet<string> {
  const over = new Set<string>();
  for (const team of teams) {
    if (team.id === selfTeamId) continue;
    const cap = rivalEstimateByTeamCategory.get(`${team.id}:${categoryId}`);
    if (cap == null) continue;
    const baselineSpent = teamSpentInCategory(team.id, categoryId, players, sales);
    const spentDuringRun = teamSpentInCategory(team.id, categoryId, players, salesSoFar) - baselineSpent;
    if (spentDuringRun >= cap) over.add(team.id);
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

  // Waterfall: whatever's left of a higher-base-price category's own
  // budget target once self is done bidding in it (target minus actual
  // self spend there, never negative) rolls down into the next category
  // self ALSO has a target for — skipping over any untargeted category in
  // between rather than landing there (an untargeted category stays
  // unconstrained, not suddenly capped by someone else's leftover).
  // orderPoolByCategoryPriority already groups shuffledPlayers into
  // highest-base-price-first blocks, so "self is done bidding in it" is
  // simply "we've moved on to a different category," detected below.
  const effectiveBudgetTargetByCategoryId = new Map(budgetTargetByCategoryId);
  let waterfallCarry = 0;
  let lastCategoryId: string | null = null;

  for (let i = 0; i < shuffledPlayers.length; i++) {
    const player = shuffledPlayers[i];
    const category = categoryById.get(player.categoryId);
    if (!category) continue; // defensive: an unmatched category name/id, see analyticsAdapter.ts's own fallback

    if (category.id !== lastCategoryId) {
      if (lastCategoryId != null) {
        const prevTarget = effectiveBudgetTargetByCategoryId.get(lastCategoryId);
        if (prevTarget != null) {
          const spentInPrev = teamSpentInCategory(selfTeamId, lastCategoryId, players, salesSoFar);
          waterfallCarry += Math.max(prevTarget - spentInPrev, 0);
        }
      }
      const thisTarget = effectiveBudgetTargetByCategoryId.get(category.id);
      if (thisTarget != null && waterfallCarry > 0) {
        effectiveBudgetTargetByCategoryId.set(category.id, thisTarget + waterfallCarry);
        waterfallCarry = 0;
      }
      lastCategoryId = category.id;
    }

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
    // A predicted-unsold guess is honored unconditionally — there's no
    // "still legal" check to make since nothing is being bought (unlike a
    // predicted winner, no team's budget/slots are at stake).
    const lot = prediction?.predictedUnsold
      ? ({ playerId: player.id, categoryId: category.id, unsold: true } as const)
      : predictedWinnerStillLegal
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
          budgetTargetByCategoryId: effectiveBudgetTargetByCategoryId,
          selfCategorySpentSoFar: teamSpentInCategory(selfTeamId, player.categoryId, players, salesSoFar),
          teamsOverEstimatedCategoryBudget: rivalsOverEstimatedCategoryBudget(
            teams,
            selfTeamId,
            player.categoryId,
            rivalEstimateByTeamCategory,
            players,
            sales,
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
 *
 * `minSquadSize` lowers that bar below the full roster size — some real
 * auctions only require a minimum squad, not every slot filled (this app's
 * own data model only tracks one squadSize today, so there's no per-auction
 * min/max to default to; a caller passes whatever threshold it wants a run
 * judged against). Defaults to the full totalSlots, i.e. today's original,
 * stricter behavior, when omitted.
 */
export function isRunComplete(
  snapshot: AuctionAnalyticsSnapshot,
  run: SimulationRun,
  minSquadSize?: number
): boolean {
  const selfTeam = snapshot.teams.find((t) => t.id === snapshot.selfTeamId);
  if (!selfTeam) return false;
  const threshold = minSquadSize ?? selfTeam.totalSlots;
  return selfSquadPlayerIds(snapshot, run).length >= threshold;
}

export type RunShortfall = {
  slotsStillNeeded: number;
  /** Self became legally unable to afford even the cheapest remaining
   * category's base price at some point before the pool ran out — a hard
   * budget wall, not a matter of losing bids. */
  ranOutOfLegalBudget: boolean;
  /** Lots self could have legally afforded (after self's last win, or
   * anywhere self still needed slots) but a rival won instead — purely a
   * competition/contention loss, not a budget problem. */
  eligibleLotsLostToRivals: number;
  /** Lots self could have legally afforded that nobody won at all — self's
   * own strategy (an avoid tag, or simply never being selected as a
   * contender by the engine's own heuristics) passed on them even though
   * budget wasn't the obstacle. */
  lotsWentUnsoldWhileEligible: number;
};

/**
 * Best-effort root cause for why self's squad came up short in one run —
 * a pure post-hoc replay of the run's already-resolved lots (no new random
 * decisions), tracking self's own budget/slots exactly as
 * simulateAuctionRun did, to classify every lot self needed but didn't win
 * into "couldn't legally afford it" vs "could have, but lost it to a rival
 * or it went unsold." Null for an already-complete run (nothing to explain)
 * or if selfTeamId doesn't resolve. `minSquadSize` — see isRunComplete —
 * is the same threshold a run is judged against, so "slots still needed"
 * here lines up with whatever bar counted it as incomplete in the first
 * place, rather than always assuming the full roster.
 */
export function diagnoseRunShortfall(
  snapshot: AuctionAnalyticsSnapshot,
  run: SimulationRun,
  minSquadSize?: number
): RunShortfall | null {
  const selfTeam = snapshot.teams.find((t) => t.id === snapshot.selfTeamId);
  if (!selfTeam) return null;

  const threshold = minSquadSize ?? selfTeam.totalSlots;
  const alreadySold = snapshot.sales.filter((s) => s.teamId === snapshot.selfTeamId).length;
  let state: TeamRunState = { budgetRemaining: selfTeam.budgetRemaining, slotsRemaining: threshold - alreadySold };
  if (state.slotsRemaining <= 0) return null;

  const unit = reserveUnit(snapshot.categories);
  const basePriceByPlayerId = new Map(snapshot.players.map((p) => [p.id, p.basePrice]));

  let ranOutOfLegalBudget = false;
  let eligibleLotsLostToRivals = 0;
  let lotsWentUnsoldWhileEligible = 0;

  for (const lot of run.lots) {
    if (state.slotsRemaining <= 0) break;
    const basePrice = basePriceByPlayerId.get(lot.playerId) ?? 0;
    const eligible = legalMaxBidEnforced(state, unit) >= basePrice;

    if ("unsold" in lot) {
      if (eligible) lotsWentUnsoldWhileEligible += 1;
      else ranOutOfLegalBudget = true;
      continue;
    }
    if (lot.teamId === snapshot.selfTeamId) {
      state = { budgetRemaining: state.budgetRemaining - lot.price, slotsRemaining: state.slotsRemaining - 1 };
    } else if (eligible) {
      eligibleLotsLostToRivals += 1;
    } else {
      ranOutOfLegalBudget = true;
    }
  }

  return { slotsStillNeeded: state.slotsRemaining, ranOutOfLegalBudget, eligibleLotsLostToRivals, lotsWentUnsoldWhileEligible };
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
